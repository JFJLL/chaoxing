import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
import { CourseOutlineSyncError } from "@/lib/imports/applyOutline";
import { ImportBatchSaveError, saveImportBatchOutline } from "@/lib/imports/saveImportBatchOutline";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findFirst({
    where: { id: jobId, deletedAt: null },
    select: { courseId: true }
  });
  if (!job) return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  try {
    await requireCourseManager(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  let body: { outline?: unknown; expectedOutlineVersion?: unknown; expectedBatchVersion?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "请求内容无效", code: "INVALID_REQUEST" }, { status: 400 });
  }
  const parsedOutline = generatedCourseOutlineSchema.safeParse(body.outline);
  if (!parsedOutline.success) {
    return NextResponse.json({ error: "课程目录内容无效", code: "COURSE_OUTLINE_INVALID" }, { status: 400 });
  }
  if (!Number.isInteger(body.expectedOutlineVersion) || Number(body.expectedOutlineVersion) < 0) {
    return NextResponse.json({ error: "课程目录版本无效，请刷新后重试", code: "COURSE_OUTLINE_VERSION_REQUIRED" }, { status: 400 });
  }
  if (!Number.isInteger(body.expectedBatchVersion) || Number(body.expectedBatchVersion) < 1) {
    return NextResponse.json({ error: "综合目录版本无效，请刷新后重试", code: "IMPORT_BATCH_VERSION_REQUIRED" }, { status: 400 });
  }

  try {
    const result = await saveImportBatchOutline({
      jobId,
      actorId: user.id,
      outline: parsedOutline.data,
      expectedOutlineVersion: Number(body.expectedOutlineVersion),
      expectedBatchVersion: Number(body.expectedBatchVersion)
    });
    return NextResponse.json({ ok: true, outlineVersion: result.outlineVersion });
  } catch (error) {
    if (error instanceof ImportBatchSaveError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof CourseOutlineSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "COURSE_OUTLINE_ITEM_INVALID" ? 400 : 409 });
    }
    throw error;
  }
}
