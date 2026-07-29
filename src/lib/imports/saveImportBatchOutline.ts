import type { GeneratedCourseOutline } from "@/types/course";
import { db } from "@/lib/db";
import { syncCourseOutline } from "@/lib/imports/applyOutline";

const REVIEWABLE_DOCUMENT_STATUSES = new Set(["READY_FOR_REVIEW", "APPLIED"]);

export class ImportBatchSaveError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "ImportBatchSaveError";
  }
}

export async function saveImportBatchOutline(input: {
  jobId: string;
  actorId: string;
  outline: GeneratedCourseOutline;
  expectedOutlineVersion: number;
  expectedBatchVersion: number;
}) {
  return db.$transaction(async (tx) => {
    const job = await tx.documentImportJob.findFirst({
      where: { id: input.jobId, deletedAt: null },
      include: {
        batch: {
          include: {
            documents: {
              where: { deletedAt: null },
              select: { status: true }
            }
          }
        }
      }
    });
    if (!job) throw new ImportBatchSaveError("IMPORT_JOB_NOT_FOUND", "导入任务不存在", 404);
    if (!job.batch) throw new ImportBatchSaveError("IMPORT_BATCH_REQUIRED", "该导入任务不属于有效分析批次，不能保存课程目录");
    const batch = job.batch;
    if (batch.savedAt || batch.status === "APPLIED" || job.status === "APPLIED") {
      throw new ImportBatchSaveError("IMPORT_BATCH_ALREADY_APPLIED", "该导入批次已保存课程目录，请从只读目录进入编辑维护");
    }
    if (batch.status !== "READY_FOR_REVIEW" || !batch.generatedOutline) {
      throw new ImportBatchSaveError("IMPORT_BATCH_NOT_READY", "多份资料尚未完成综合分析，暂不能保存课程目录");
    }
    if (!batch.documents.length || batch.documents.some((document) => !REVIEWABLE_DOCUMENT_STATUSES.has(document.status))) {
      throw new ImportBatchSaveError("IMPORT_BATCH_DOCUMENTS_INCOMPLETE", "批次仍有资料未完成，暂不能保存课程目录");
    }
    if (batch.generatedOutlineVersion !== input.expectedBatchVersion) {
      throw new ImportBatchSaveError("IMPORT_BATCH_VERSION_CONFLICT", "综合目录版本已变化，请刷新后重新审核");
    }

    const synced = await syncCourseOutline({
      courseId: job.courseId,
      outline: input.outline,
      actorId: input.actorId,
      expectedOutlineVersion: input.expectedOutlineVersion,
      tx
    });
    const saved = await tx.documentImportBatch.updateMany({
      where: {
        id: batch.id,
        savedAt: null,
        status: "READY_FOR_REVIEW",
        generatedOutlineVersion: input.expectedBatchVersion
      },
      data: {
        generatedOutline: JSON.stringify(input.outline),
        status: "APPLIED",
        savedAt: new Date(),
        savedOutlineVersion: synced.outlineVersion
      }
    });
    if (saved.count !== 1) {
      throw new ImportBatchSaveError("IMPORT_BATCH_VERSION_CONFLICT", "综合目录已被其他教师保存，请刷新后重试");
    }
    await tx.documentImportJob.updateMany({
      where: { batchId: batch.id, deletedAt: null },
      data: { status: "APPLIED" }
    });
    return synced;
  });
}
