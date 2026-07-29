import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireCourseAccess, requireCourseManager } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);

  return NextResponse.json({ artifact: null });
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  return NextResponse.json({
    code: "HTML_COURSEWARE_RETIRED",
    error: "HTML 互动课件已停止生成，请使用 PPT 课件",
    href: `/space/courses/${courseId}/ai-workbench/apps/ppt_courseware`
  }, { status: 410 });
}
