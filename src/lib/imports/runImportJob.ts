import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";
import { generateCourseOutline } from "@/lib/ai/generateCourseOutline";
import { createKnowledgeMapDraft } from "@/lib/knowledgeMap/generateKnowledgeMap";

export async function runImportJob(jobId: string) {
  const job = await db.documentImportJob.findUnique({ where: { id: jobId } });
  if (!job || !job.filePath) {
    throw new Error("导入任务不存在或缺少文件");
  }

  try {
    await db.documentImportJob.update({
      where: { id: jobId },
      data: { status: "EXTRACTING", currentStage: "文档解析", errorMessage: null, startedAt: new Date(), finishedAt: null }
    });
    const extracted = await extractText(job.filePath, job.mimeType);
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        extractedText: extracted.text,
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
        warning: generated.warning ?? null,
        status: "MAPPING",
        currentStage: "知识导图生成"
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
        warning: generated.warning ?? null,
        finishedAt: new Date()
      }
    });
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
    throw error;
  }
}
