import { db } from "@/lib/db";
import { extractText } from "@/lib/document/extractText";

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
        status: "READY_FOR_REVIEW",
        warning: "当前任务已完成文档解析，目录生成将在下一阶段接入。"
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
