import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";
import { generateCourseOutline } from "@/lib/ai/generateCourseOutline";

export async function runImportJob(jobId: string) {
  const job = await db.documentImportJob.findUnique({ where: { id: jobId } });
  if (!job || !job.filePath) {
    throw new Error("导入任务不存在或缺少文件");
  }

  try {
    await db.documentImportJob.update({
      where: { id: jobId },
      data: { status: "EXTRACTING", errorMessage: null }
    });
    const extracted = await extractText(job.filePath, job.mimeType);
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        extractedText: extracted.text,
        status: "GENERATING"
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
        extractedText: extracted.text,
        generatedOutline: JSON.stringify(generated.outline),
        status: "READY_FOR_REVIEW",
        warning: generated.warning ?? null
      }
    });
  } catch (error) {
    await db.documentImportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "导入任务失败"
      }
    });
    throw error;
  }
}
