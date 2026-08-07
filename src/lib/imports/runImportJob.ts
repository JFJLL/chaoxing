import { db } from "@/lib/db";
import { extractText, type ExtractedDocument } from "@/lib/document/extractText";
import { PdfHasNoTextLayerError } from "@/lib/document/extractPdf";
import { indexKnowledgeDocument } from "@/lib/document/knowledgeDb";
import { generateCourseOutline, generateCourseOutlineFromPdf } from "@/lib/ai/generateCourseOutline";
import type { GeneratedCourseOutline } from "@/types/course";
import { createKnowledgeMapDraft } from "@/lib/knowledgeMap/generateKnowledgeMap";
import { withImportFilePath } from "@/lib/storage";
import { withDriveFilePath } from "@/lib/modules/driveFiles";
import { finalizeImportBatch } from "@/lib/imports/importBatch";
import { buildDocumentSections, buildSectionsFromOutline } from "@/lib/imports/documentSections";

class ImportJobDeletedError extends Error {
  constructor() {
    super("导入任务已被删除");
    this.name = "ImportJobDeletedError";
  }
}

export async function runImportJob(jobId: string) {
  const job = await db.documentImportJob.findUnique({ where: { id: jobId }, include: { driveFile: true } });
  if (!job || !job.filePath) {
    throw new Error("导入任务不存在或缺少文件");
  }
  // A batch delete can soft-delete jobs while they are queued or in flight.
  // deletedAt is the source of truth for visibility, so a deleted job must not
  // be resurfaced by the worker writing a visible status back onto it.
  if (job.deletedAt) return;

  // Only update while the job is still visible; if it was deleted mid-flight the
  // guarded write matches zero rows and we abort the remaining pipeline.
  const advance = async (data: Parameters<typeof db.documentImportJob.updateMany>[0]["data"]) => {
    const updated = await db.documentImportJob.updateMany({ where: { id: jobId, deletedAt: null }, data });
    if (updated.count !== 1) throw new ImportJobDeletedError();
    return updated;
  };

  try {
    await advance({ status: "EXTRACTING", currentStage: "文档解析", errorMessage: null, startedAt: new Date(), finishedAt: null });
    const course = await db.course.findUnique({
      where: { id: job.courseId },
      select: { title: true }
    });
    const courseTitle = course?.title ?? job.originalName;

    // For a scanned PDF (no text layer) we skip transcription and generate the
    // outline directly from the file via a multimodal model, reading it while
    // it is still materialised locally.
    const process = async (localPath: string): Promise<{ extracted: ExtractedDocument; outline?: GeneratedCourseOutline }> => {
      try {
        return { extracted: await extractText(localPath, job.mimeType) };
      } catch (error) {
        if (error instanceof PdfHasNoTextLayerError) {
          const generated = await generateCourseOutlineFromPdf({ courseTitle, filePath: localPath });
          return { extracted: { text: "", chunks: [], wordCount: 0, pages: error.pages }, outline: generated.outline };
        }
        throw error;
      }
    };
    const { extracted, outline: pdfOutline } = job.driveFile
      ? await withDriveFilePath(job.driveFile, process)
      : await withImportFilePath(job.filePath, process);

    // Index every chunk of the parsed document into the local FTS5 knowledge
    // database (PDF chunks keep their page number). Keyed by the drive file id
    // when the import came from the cloud drive so AI tutor attachments can
    // find the same rows. A search-index failure must never fail the import.
    let knowledgeIndexWarning: string | null = null;
    try {
      indexKnowledgeDocument(job.driveFileId ?? job.id, extracted);
    } catch (indexError) {
      knowledgeIndexWarning = `知识库索引失败：${indexError instanceof Error ? indexError.message : "未知错误"}`;
    }
    await advance({
      extractedText: extracted.text,
      status: "STRUCTURING",
      currentStage: "课程结构生成"
    });
    const generated = pdfOutline
      ? { outline: pdfOutline }
      : await generateCourseOutline({
          courseTitle,
          documentText: extracted.text,
          chunks: extracted.chunks
        });
    // Prefer sections parsed from the real text; when that is too coarse or
    // unavailable (e.g. a scanned PDF), fall back to the generated outline (目录)
    // so the lesson-plan source panel always shows selectable sub-points.
    let parsedSections = buildDocumentSections({
      documentId: job.id,
      text: extracted.text,
      chunks: extracted.chunks
    });
    if (parsedSections.length <= 1) {
      const outlineSections = buildSectionsFromOutline(job.id, generated.outline);
      if (outlineSections.length > 1) parsedSections = outlineSections;
    }
    await advance({
      parsedSections: JSON.stringify(parsedSections),
      generatedOutline: JSON.stringify(generated.outline),
      warning: null,
      status: "MAPPING",
      currentStage: "知识图谱生成"
    });
    await createKnowledgeMapDraft({
      courseId: job.courseId,
      sourceJobId: job.id,
      outline: generated.outline
    });
    await advance({
      generatedOutline: JSON.stringify(generated.outline),
      status: "READY_FOR_REVIEW",
      currentStage: "等待教师审核",
      ...(knowledgeIndexWarning ? { warning: knowledgeIndexWarning } : { warning: null }),
      finishedAt: new Date()
    });
    if (job.batchId) await finalizeImportBatch(job.batchId);
  } catch (error) {
    if (error instanceof ImportJobDeletedError) return;
    await db.documentImportJob.updateMany({
      where: { id: jobId, deletedAt: null },
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
