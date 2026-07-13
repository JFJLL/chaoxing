import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";
import { aiCoachAttemptCreateSchema, recoverStaleCoachAttempts, toAiCoachTaskDto } from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string }> };

const attemptDetailInclude = {
  coachTask: true,
  messages: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] }
} satisfies Prisma.CourseAiConversationInclude;

function serializeAttempt(attempt: {
  id: string;
  courseId: string;
  userId: string;
  kind: string;
  status: string;
  title: string | null;
  evaluation: string | null;
  evaluationStatus: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  coachTask: Parameters<typeof toAiCoachTaskDto>[0] | null;
  messages: Array<{ id: string; role: string; content: string; createdAt: Date }>;
}) {
  return {
    id: attempt.id,
    courseId: attempt.courseId,
    userId: attempt.userId,
    kind: attempt.kind,
    status: attempt.status,
    title: attempt.title,
    evaluation: attempt.evaluation ? JSON.parse(attempt.evaluation) : null,
    evaluationStatus: attempt.evaluationStatus,
    completedAt: attempt.completedAt,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    task: attempt.coachTask ? toAiCoachTaskDto(attempt.coachTask) : null,
    messages: attempt.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }))
  };
}

function parseEvaluation(raw: string | null) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function GET(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || null;
  if (cursor && cursor.length > 200) {
    return NextResponse.json({ code: "AI_COACH_CURSOR_INVALID", error: "分页参数无效" }, { status: 400 });
  }
  await recoverStaleCoachAttempts(courseId, canManage ? {} : { userId: user.id });
  const attempts = await db.courseAiConversation.findMany({
    where: { courseId, kind: "COACH", ...(canManage ? {} : { userId: user.id }) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 51,
    select: {
      id: true,
      courseId: true,
      userId: true,
      kind: true,
      status: true,
      title: true,
      evaluation: true,
      evaluationStatus: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      coachTask: true,
      _count: { select: { messages: true } },
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { role: true } }
    }
  });
  const page = attempts.slice(0, 50);
  return NextResponse.json({
    attempts: page.map((attempt) => ({
      id: attempt.id,
      courseId: attempt.courseId,
      userId: attempt.userId,
      kind: attempt.kind,
      status: attempt.status,
      title: attempt.title,
      evaluation: parseEvaluation(attempt.evaluation),
      evaluationStatus: attempt.evaluationStatus,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      task: attempt.coachTask ? toAiCoachTaskDto(attempt.coachTask) : null,
      messageCount: attempt._count.messages,
      lastMessageRole: attempt.messages[0]?.role ?? null,
      messages: [],
      detailsLoaded: false
    })),
    nextCursor: attempts.length > 50 ? page.at(-1)?.id ?? null : null,
    canManage
  });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);
  const parsed = aiCoachAttemptCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "AI_COACH_ATTEMPT_INVALID", error: "陪练任务参数无效" }, { status: 400 });
  }
  const task = await db.aiCoachTask.findFirst({
    where: { id: parsed.data.taskId, courseId, status: "PUBLISHED" }
  });
  if (!task) {
    return NextResponse.json({ code: "AI_COACH_TASK_UNAVAILABLE", error: "陪练任务不存在或尚未发布" }, { status: 409 });
  }
  const attempt = await db.courseAiConversation.create({
    data: {
      courseId,
      userId: user.id,
      kind: "COACH",
      status: "ACTIVE",
      title: task.title,
      coachTaskId: task.id,
      evaluationStatus: "PENDING"
    },
    include: attemptDetailInclude
  });
  return NextResponse.json({ attempt: serializeAttempt(attempt) }, { status: 201 });
}
