import { db } from "@/lib/db";
import { generateCourseOutline } from "@/lib/ai/generateCourseOutline";

const REVIEWABLE_DOCUMENT_STATUSES = new Set(["READY_FOR_REVIEW", "APPLIED"]);

export async function finalizeImportBatch(batchId: string) {
  const batch = await db.documentImportBatch.findUnique({
    where: { id: batchId },
    include: {
      course: { select: { title: true } },
      documents: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!batch || batch.savedAt || batch.status === "READY_FOR_REVIEW" || batch.status === "APPLIED") return;
  if (batch.documents.some((document) => document.status === "FAILED")) {
    await db.documentImportBatch.updateMany({
      where: { id: batchId, status: { notIn: ["READY_FOR_REVIEW", "APPLIED"] } },
      data: { status: "FAILED" }
    });
    return;
  }
  if (!batch.documents.length || batch.documents.some((document) => !REVIEWABLE_DOCUMENT_STATUSES.has(document.status))) return;

  const claimed = await db.documentImportBatch.updateMany({
    where: { id: batchId, status: { in: ["QUEUED", "PROCESSING"] } },
    data: { status: "COMBINING" }
  });
  if (claimed.count !== 1) return;

  try {
    let generatedOutline: string;
    if (batch.documents.length === 1 && batch.documents[0]?.generatedOutline) {
      generatedOutline = batch.documents[0].generatedOutline;
    } else {
      const combinedText = batch.documents
        .map((document, index) => `资料 ${index + 1}：${document.originalName}\n${document.extractedText ?? ""}`)
        .join("\n\n---\n\n");
      const generated = await generateCourseOutline({
        courseTitle: batch.course.title,
        documentText: combinedText,
        chunks: [combinedText]
      });
      generatedOutline = JSON.stringify(generated.outline);
    }
    await db.documentImportBatch.update({
      where: { id: batchId },
      data: { generatedOutline, status: "READY_FOR_REVIEW" }
    });
  } catch {
    await db.documentImportBatch.update({ where: { id: batchId }, data: { status: "FAILED" } });
  }
}
