import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { enqueueImportJob } from "@/lib/imports/importQueue";
import { finalizeImportBatch } from "@/lib/imports/importBatch";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { jobId } = await context.params;
  const job = await db.documentImportJob.findUnique({
    where: { id: jobId },
    include: { batch: { include: { documents: { where: { deletedAt: null }, select: { status: true } } } } }
  });
  if (!job) {
    return NextResponse.json({ error: "导入任务不存在" }, { status: 404 });
  }
  try {
    await requireCourseManager(user, job.courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }
  const canRetryCombination = job.batch?.status === "FAILED"
    && !job.batch.generatedOutline
    && job.batch.documents.length > 0
    && job.batch.documents.every((document) => document.status === "READY_FOR_REVIEW" || document.status === "APPLIED");
  if (canRetryCombination) {
    const reopened = await db.documentImportBatch.updateMany({
      where: { id: job.batch!.id, status: "FAILED", savedAt: null, generatedOutline: null },
      data: { status: "PROCESSING" }
    });
    if (reopened.count !== 1) {
      return NextResponse.json({ error: "批次已被其他操作重试，请刷新查看" }, { status: 409 });
    }
    try {
      await finalizeImportBatch(job.batch!.id);
      return NextResponse.json({ job, batchRetried: true });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "综合目录重试失败"
      }, { status: 503 });
    }
  }
  if (job.status !== "FAILED") {
    return NextResponse.json({ error: "只有失败任务可以重试" }, { status: 400 });
  }
  if (!job.filePath) {
    return NextResponse.json({ error: "任务缺少源文件，无法重试" }, { status: 400 });
  }

  const next = await db.$transaction(async (tx) => {
    const claimed = await tx.documentImportJob.updateMany({
      where: { id: job.id, status: "FAILED" },
      data: {
        status: "QUEUED",
        currentStage: "等待重试",
        retryCount: { increment: 1 },
        startedAt: null,
        finishedAt: null,
        errorMessage: null
      }
    });
    if (claimed.count !== 1) return null;
    if (job.batchId) {
      await tx.documentImportBatch.updateMany({
        where: { id: job.batchId, status: "FAILED", savedAt: null },
        data: { status: "PROCESSING", generatedOutline: null }
      });
    }
    return tx.documentImportJob.findUnique({ where: { id: job.id } });
  });
  if (!next) {
    return NextResponse.json({ error: "任务已被其他操作重试，请刷新查看" }, { status: 409 });
  }
  enqueueImportJob(job.id);

  return NextResponse.json({ job: next });
}
