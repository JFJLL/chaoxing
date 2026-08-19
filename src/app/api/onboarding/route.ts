import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TEACHER_ONBOARDING_MAX_AUTO_PROMPTS,
  TEACHER_ONBOARDING_VERSION,
  canAutoPromptTeacherOnboarding,
  clampTeacherOnboardingStep
} from "@/lib/onboarding/teacherOnboarding";

const STEP_COUNT = 7;

type OnboardingAction = "START_SESSION" | "SAVE_STEP" | "SET_COURSE" | "PAUSE" | "COMPLETED" | "RESTART";

type OnboardingRecord = {
  onboardingState: string | null;
  onboardingVersion: number;
  onboardingStep: number;
  onboardingCourseId: string | null;
  onboardingPromptCount: number;
  onboardingLastPromptAt: Date | null;
  onboardingLastSessionId: string | null;
};

function serialize(record: Pick<OnboardingRecord, "onboardingState" | "onboardingStep" | "onboardingCourseId" | "onboardingPromptCount">) {
  return {
    onboardingState: record.onboardingState,
    onboardingStep: record.onboardingStep,
    onboardingCourseId: record.onboardingCourseId,
    onboardingPromptCount: record.onboardingPromptCount
  };
}

async function resolveTeacherCourseId(userId: string, preferredCourseId: string | null) {
  const course = await db.course.findFirst({
    where: {
      ...(preferredCourseId ? { id: preferredCourseId } : {}),
      OR: [
        { ownerId: userId },
        { collaborators: { some: { userId } } }
      ]
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });
  if (course) return course.id;
  if (preferredCourseId) return resolveTeacherCourseId(userId, null);
  return null;
}

async function currentRecord(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      onboardingState: true,
      onboardingVersion: true,
      onboardingStep: true,
      onboardingCourseId: true,
      onboardingPromptCount: true,
      onboardingLastPromptAt: true,
      onboardingLastSessionId: true
    }
  }) as Promise<OnboardingRecord | null>;
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "仅教师账户需要完成首次使用引导" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { action?: unknown; step?: unknown; courseId?: unknown } | null;
  const action = body?.action as OnboardingAction | undefined;
  if (!action || !["START_SESSION", "SAVE_STEP", "SET_COURSE", "PAUSE", "COMPLETED", "RESTART"].includes(action)) {
    return NextResponse.json({ error: "无效的引导操作" }, { status: 400 });
  }

  const current = await currentRecord(user.id);
  if (!current) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  if (action === "START_SESSION") {
    if (!canAutoPromptTeacherOnboarding(current, user.sessionId)) {
      return NextResponse.json({ show: false, ...serialize(current) });
    }
    const courseId = await resolveTeacherCourseId(user.id, current.onboardingCourseId);
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        onboardingState: "IN_PROGRESS",
        onboardingVersion: TEACHER_ONBOARDING_VERSION,
        onboardingCourseId: courseId,
        onboardingStep: courseId ? clampTeacherOnboardingStep(current.onboardingStep, STEP_COUNT) : 0,
        onboardingPromptCount: { increment: 1 },
        onboardingLastPromptAt: new Date(),
        onboardingLastSessionId: user.sessionId
      },
      select: {
        onboardingState: true,
        onboardingStep: true,
        onboardingCourseId: true,
        onboardingPromptCount: true
      }
    });
    return NextResponse.json({ show: true, ...serialize(updated) });
  }

  if (action === "RESTART") {
    const courseId = await resolveTeacherCourseId(user.id, null);
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        onboardingState: "IN_PROGRESS",
        onboardingVersion: TEACHER_ONBOARDING_VERSION,
        onboardingStep: 0,
        onboardingCourseId: courseId,
        onboardingCompletedAt: null
      },
      select: {
        onboardingState: true,
        onboardingStep: true,
        onboardingCourseId: true,
        onboardingPromptCount: true
      }
    });
    return NextResponse.json({ show: true, ...serialize(updated) });
  }

  if (action === "COMPLETED") {
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        onboardingState: "COMPLETED",
        onboardingVersion: TEACHER_ONBOARDING_VERSION,
        onboardingStep: STEP_COUNT - 1,
        onboardingCompletedAt: new Date()
      },
      select: {
        onboardingState: true,
        onboardingStep: true,
        onboardingCourseId: true,
        onboardingPromptCount: true
      }
    });
    return NextResponse.json({ show: false, ...serialize(updated) });
  }

  const requestedStep = clampTeacherOnboardingStep(body?.step, STEP_COUNT);
  const requestedCourseId = typeof body?.courseId === "string" && body.courseId.trim() ? body.courseId : undefined;
  if (requestedCourseId) {
    const courseId = await resolveTeacherCourseId(user.id, requestedCourseId);
    if (courseId !== requestedCourseId) return NextResponse.json({ error: "无法使用该课程继续引导" }, { status: 403 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      onboardingState: "IN_PROGRESS",
      onboardingVersion: TEACHER_ONBOARDING_VERSION,
      ...(action === "SAVE_STEP" ? { onboardingStep: requestedStep } : {}),
      ...(action === "SET_COURSE" ? { onboardingCourseId: requestedCourseId ?? current.onboardingCourseId, onboardingStep: requestedStep } : {})
    },
    select: {
      onboardingState: true,
      onboardingStep: true,
      onboardingCourseId: true,
      onboardingPromptCount: true
    }
  });

  return NextResponse.json({ show: action !== "PAUSE", ...serialize(updated), maxAutoPrompts: TEACHER_ONBOARDING_MAX_AUTO_PROMPTS });
}
