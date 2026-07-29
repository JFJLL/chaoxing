import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";
import { generateCourseOutline } from "@/lib/ai/generateCourseOutline";
import { createKnowledgeMapDraft } from "@/lib/knowledgeMap/generateKnowledgeMap";
import { withImportFilePath } from "@/lib/storage";
import { withDriveFilePath } from "@/lib/modules/driveFiles";
import { finalizeImportBatch } from "@/lib/imports/importBatch";
import { buildDocumentSections } from "@/lib/imports/documentSections";

export async function runImportJob(jobId: string) {
  const job = await db.documentImportJob.findUnique({ where: { id: jobId }, include: { driveFile: true } });
  if (!job || !job.filePath) {
    throw new Error("导入任务不存在或缺少文件");
  }

  try {
    await db.documentImportJob.update({
      where: { id: jobId },
      data: { status: "EXTRACTING", currentStage: "文档解析", errorMessage: null, startedAt: new Date(), finishedAt: null }
    });
    const extract = (localPath: string) => extractText(localPath, job.mimeType);
    const extracted = job.driveFile
      ? await withDriveFilePath(job.driveFile, extract)
      : await withImportFilePath(job.filePath, extract);
    const parsedSections = buildDocumentSections({
      documentId: job.id,
      text: extracted.text,
      chunks: extracted.chunks
    });
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        extractedText: extracted.text,
        parsedSections: JSON.stringify(parsedSections),
        status: "STRUCTURING",
        currentStage: "课程结构生成"
      }
    });
    const course = await db.course.findUnique({
      where: { id: job.courseId },
      select: { title: true }
    });
    const generated = await generateCourseOutline({
      courseTitle: course?.title ?? job.originalName,
      documentText: extracted.text,
      chunks: extracted.chunks
    });
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        generatedOutline: JSON.stringify(generated.outline),
        warning: null,
        status: "MAPPING",
        currentStage: "知识图谱生成"
      }
    });
    await createKnowledgeMapDraft({
      courseId: job.courseId,
      sourceJobId: job.id,
      outline: generated.outline
    });
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        generatedOutline: JSON.stringify(generated.outline),
        status: "READY_FOR_REVIEW",
        currentStage: "等待教师审核",
        warning: null,
        finishedAt: new Date()
      }
    });
    if (job.batchId) await finalizeImportBatch(job.batchId);
  } catch (error) {
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        currentStage: "导入失败",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "导入任务失败"
      }
    });
    if (job.batchId) {
      await db.documentImportBatch.updateMany({
        where: { id: job.batchId, status: { notIn: ["APPLIED", "READY_FOR_REVIEW"] } },
        data: { status: "FAILED" }
      });
    }
    throw error;
  }
}
