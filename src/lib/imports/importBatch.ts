import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { generateCourseOutline } from "@/lib/ai/generateCourseOutline";

const REVIEWABLE_DOCUMENT_STATUSES = new Set(["READY_FOR_REVIEW", "APPLIED"]);

export async function finalizeImportBatch(batchId: string) {
  const batch = await db.documentImportBatch.findUnique({
    where: { id: batchId },
    include: {
      course: { select: { id: true, title: true } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!batch || batch.savedAt || batch.status === "READY_FOR_REVIEW" || batch.status === "APPLIED" || batch.status === "COMBINING") return;
  if (batch.documents.some((document) => document.status === "FAILED")) {
    const failed = await db.documentImportBatch.updateMany({
      where: { id: batchId, savedAt: null, status: { notIn: ["READY_FOR_REVIEW", "APPLIED"] } },
      data: { status: "FAILED" }
    });
    if (failed.count) revalidateImportSurfaces(batch.course.id);
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
    const completed = await db.documentImportBatch.updateMany({
      where: { id: batchId, status: "COMBINING", savedAt: null },
      data: {
        generatedOutline,
        generatedOutlineVersion: { increment: 1 },
        status: "READY_FOR_REVIEW"
      }
    });
    if (completed.count) revalidateImportSurfaces(batch.course.id);
  } catch {
    const failed = await db.documentImportBatch.updateMany({
      where: { id: batchId, status: "COMBINING", savedAt: null },
      data: { status: "FAILED" }
    });
    if (failed.count) revalidateImportSurfaces(batch.course.id);
  }
}

function revalidateImportSurfaces(courseId: string) {
  for (const path of [
    `/space/courses/${courseId}/ai-workbench/content`,
    `/space/courses/${courseId}/builder`,
    `/space/courses/${courseId}/knowledge-map`
  ]) {
    try {
      revalidatePath(path, "page");
    } catch {
      // Batch combining may finish in a queue worker without a request context.
    }
  }
}
