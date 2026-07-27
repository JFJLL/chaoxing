import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess, requireCourseOwner } from "@/lib/permissions";
import { htmlCoursewarePayloadSchema } from "@/types/courseWorkspace";

type RouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  await requireCourseAccess(user, courseId);

  const artifact = await db.courseAiArtifact.findFirst({
    where: { courseId, appType: "html_courseware", status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      appType: true,
      title: true,
      status: true,
      version: true,
      payload: true,
      publishedAt: true,
      createdAt: true
    }
  });

  if (!artifact) {
    return NextResponse.json({ artifact: null });
  }

  let payload;
  try {
    payload = artifact.payload ? htmlCoursewarePayloadSchema.parse(JSON.parse(artifact.payload)) : null;
  } catch {
    return NextResponse.json({ artifact: null });
  }
  if (!payload) return NextResponse.json({ artifact: null });

  return NextResponse.json({
    artifact: {
      id: artifact.id,
      appType: artifact.appType,
      title: artifact.title,
      status: artifact.status,
      version: artifact.version,
      payload,
      publishedAt: artifact.publishedAt,
      createdAt: artifact.createdAt
    }
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    await requireCourseOwner(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  return NextResponse.json({
    code: "HTML_COURSEWARE_RETIRED",
    error: "HTML 互动课件已停止生成，请使用 PPT 课件",
    href: `/space/courses/${courseId}/ai-workbench/apps/ppt_courseware`
  }, { status: 410 });
}
