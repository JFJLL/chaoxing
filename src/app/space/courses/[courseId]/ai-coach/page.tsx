import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { recoverStaleCoachAttempts, toAiCoachTaskDto } from "@/lib/courseWorkspace/aiCoach";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AiCoach, type AiCoachAttemptDto, type AiCoachTaskDto } from "@/components/course-workspace/AiCoach";

type PageProps = { params: Promise<{ courseId: string }> };

function serializeTask(task: Parameters<typeof toAiCoachTaskDto>[0]): AiCoachTaskDto {
  const dto = toAiCoachTaskDto(task);
  return {
    ...dto,
    publishedAt: dto.publishedAt?.toISOString() ?? null,
    createdAt: dto.createdAt.toISOString(),
    updatedAt: dto.updatedAt.toISOString()
  };
}

function parseEvaluation(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiCoachAttemptDto["evaluation"];
  } catch {
    return null;
  }
}

export default async function AiCoachPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  await recoverStaleCoachAttempts(courseId, canManage ? {} : { userId: user.id });
  const [tasks, attempts] = await Promise.all([
    db.aiCoachTask.findMany({
      where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    }),
    db.courseAiConversation.findMany({
      where: { courseId, kind: "COACH", ...(canManage ? {} : { userId: user.id }) },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
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
    })
  ]);
  const attemptPage = attempts.slice(0, 50);
  const nextCursor = attempts.length > 50 ? attemptPage.at(-1)?.id ?? null : null;
  const firstAttemptDetail = attemptPage[0] ? await db.courseAiConversation.findFirst({
    where: { id: attemptPage[0].id, courseId, kind: "COACH", ...(canManage ? {} : { userId: user.id }) },
    include: { coachTask: true, messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 } }
  }) : null;

  const taskDtos = tasks.map(serializeTask);
  const attemptDtos: AiCoachAttemptDto[] = attemptPage.map((attempt) => ({
    id: attempt.id,
    courseId: attempt.courseId,
    userId: attempt.userId,
    kind: attempt.kind,
    status: attempt.status,
    title: attempt.title,
    evaluation: parseEvaluation(attempt.evaluation),
    evaluationStatus: attempt.evaluationStatus,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
    task: attempt.coachTask ? serializeTask(attempt.coachTask) : null,
    messages: firstAttemptDetail?.id === attempt.id ? firstAttemptDetail.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString()
    })) : [],
    messageCount: attempt._count.messages,
    lastMessageRole: attempt.messages[0]?.role ?? null,
    detailsLoaded: firstAttemptDetail?.id === attempt.id
  }));

  return (
    <FanyaCourseShell user={user} course={course} activeTab="activities">
      <CourseModulePanel title="AI陪练" description="教师配置真实任务与评价标准，学生完成多轮 AI 对话后获得基于对话证据的评价。">
        <AiCoach
          courseId={courseId}
          currentUserId={user.id}
          canManage={canManage}
          initialTasks={taskDtos}
          initialAttempts={attemptDtos}
          initialNextCursor={nextCursor}
        />
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
