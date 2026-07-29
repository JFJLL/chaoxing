import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
import { applyOutlineToCourse, CourseOutlineConflictError } from "@/lib/imports/applyOutline";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findUnique({
    where: { id: jobId },
    include: { batch: true, course: { select: { outlineVersion: true } } }
  });
  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  try {
    await requireCourseManager(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  if (job.batch?.savedAt || job.status === "APPLIED") {
    return NextResponse.json({ error: "该导入批次已保存课程目录，请从只读目录进入编辑维护", code: "IMPORT_BATCH_ALREADY_APPLIED" }, { status: 409 });
  }
  const body = (await request.json()) as { outline?: unknown; expectedOutlineVersion?: unknown };
  const outline = generatedCourseOutlineSchema.parse(body.outline);
  if (!Number.isInteger(body.expectedOutlineVersion) || Number(body.expectedOutlineVersion) < 0) {
    return NextResponse.json({ error: "课程目录版本无效，请刷新后重试", code: "COURSE_OUTLINE_VERSION_REQUIRED" }, { status: 400 });
  }

  try {
    await db.$transaction(async (tx) => {
      const expectedOutlineVersion = Number(body.expectedOutlineVersion);
      await applyOutlineToCourse({ courseId: job.courseId, outline, actorId: user.id, expectedOutlineVersion, tx });
      if (job.batchId) {
        await tx.documentImportBatch.update({
          where: { id: job.batchId },
          data: {
            generatedOutline: JSON.stringify(outline),
            status: "APPLIED",
            savedAt: new Date(),
            savedOutlineVersion: expectedOutlineVersion + 1
          }
        });
        await tx.documentImportJob.updateMany({
          where: { batchId: job.batchId, deletedAt: null },
          data: { status: "APPLIED" }
        });
      } else {
        await tx.documentImportJob.update({
          where: { id: job.id },
          data: { generatedOutline: JSON.stringify(outline), status: "APPLIED" }
        });
      }
    });
  } catch (error) {
    if (error instanceof CourseOutlineConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, outlineVersion: Number(body.expectedOutlineVersion) + 1 });
}
