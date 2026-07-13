import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner } from "@/lib/permissions";
import { aiCoachTaskUpdateSchema, toAiCoachTaskDto } from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string; taskId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, taskId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ code: "FORBIDDEN", error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const parsed = aiCoachTaskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "AI_COACH_TASK_INVALID", error: "陪练任务配置无效" }, { status: 400 });
  }
  const source = await db.aiCoachTask.findFirst({ where: { id: taskId, courseId } });
  if (!source) return NextResponse.json({ code: "AI_COACH_TASK_NOT_FOUND", error: "陪练任务不存在" }, { status: 404 });

  const { status, rubricDimensions, ...configuration } = parsed.data;
  const changesConfiguration = rubricDimensions !== undefined || Object.keys(configuration).length > 0;
  const validDraftStatus = source.status === "DRAFT" && (status === undefined || status === "DRAFT" || status === "PUBLISHED" || status === "ARCHIVED");
  const validPublishedStatus = source.status === "PUBLISHED" && !changesConfiguration && status === "ARCHIVED";
  if (!validDraftStatus && !validPublishedStatus) {
    return NextResponse.json({
      code: "AI_COACH_TASK_IMMUTABLE",
      error: "已发布或已归档的陪练任务不能修改评价标准，请新建任务"
    }, { status: 409 });
  }

  const publishedAt = status === "PUBLISHED" ? new Date() : source.publishedAt;
  const data = {
    ...configuration,
    ...(rubricDimensions === undefined ? {} : { rubric: JSON.stringify(rubricDimensions) }),
    ...(status === undefined ? {} : { status }),
    ...(status === "PUBLISHED" ? { publishedAt } : {}),
    version: { increment: 1 }
  };
  const updated = await db.aiCoachTask.updateMany({
    where: { id: taskId, courseId, status: source.status, version: source.version },
    data
  });
  if (updated.count !== 1) {
    return NextResponse.json({ code: "AI_COACH_TASK_CONFLICT", error: "任务已被更新，请刷新后重试" }, { status: 409 });
  }
  return NextResponse.json({
    task: toAiCoachTaskDto({
      ...source,
      ...configuration,
      ...(rubricDimensions === undefined ? {} : { rubric: JSON.stringify(rubricDimensions) }),
      ...(status === undefined ? {} : { status }),
      publishedAt,
      version: source.version + 1,
      updatedAt: new Date()
    })
  });
}
