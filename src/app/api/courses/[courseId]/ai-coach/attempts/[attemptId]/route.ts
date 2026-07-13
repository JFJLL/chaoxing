import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";
import { recoverStaleCoachAttempts, toAiCoachTaskDto } from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string; attemptId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, attemptId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  await recoverStaleCoachAttempts(courseId, {
    attemptId,
    ...(canManage ? {} : { userId: user.id })
  });
  const attempt = await db.courseAiConversation.findFirst({
    where: { id: attemptId, courseId, kind: "COACH", ...(canManage ? {} : { userId: user.id }) },
    include: {
      coachTask: true,
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 }
    }
  });
  if (!attempt?.coachTask) {
    return NextResponse.json({ code: "AI_COACH_ATTEMPT_NOT_FOUND", error: "陪练记录不存在" }, { status: 404 });
  }
  let evaluation = null;
  try { evaluation = attempt.evaluation ? JSON.parse(attempt.evaluation) : null; } catch { evaluation = null; }
  return NextResponse.json({
    attempt: {
      id: attempt.id,
      courseId: attempt.courseId,
      userId: attempt.userId,
      kind: attempt.kind,
      status: attempt.status,
      title: attempt.title,
      evaluation,
      evaluationStatus: attempt.evaluationStatus,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      task: toAiCoachTaskDto(attempt.coachTask),
      messages: attempt.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt
      }))
    }
  });
}
