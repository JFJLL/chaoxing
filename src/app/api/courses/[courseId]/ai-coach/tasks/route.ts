import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher, requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import { aiCoachTaskCreateSchema, toAiCoachTaskDto } from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string }> };

const taskSelect = {
  id: true,
  courseId: true,
  createdById: true,
  title: true,
  scenario: true,
  aiRole: true,
  objective: true,
  rubric: true,
  completionCriteria: true,
  status: true,
  version: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  const course = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const tasks = await db.aiCoachTask.findMany({
    where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: taskSelect
  });
  return NextResponse.json({ tasks: tasks.map(toAiCoachTaskDto), canManage });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ code: "FORBIDDEN", error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const parsed = aiCoachTaskCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "AI_COACH_TASK_INVALID", error: "陪练任务配置无效" }, { status: 400 });
  }
  const { rubricDimensions, ...fields } = parsed.data;
  const task = await db.aiCoachTask.create({
    data: {
      courseId,
      createdById: user.id,
      ...fields,
      rubric: JSON.stringify(rubricDimensions),
      status: "DRAFT",
      version: 1
    },
    select: taskSelect
  });
  return NextResponse.json({ task: toAiCoachTaskDto(task) }, { status: 201 });
}
