import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { buildExtractedDocument } from "@/lib/document/normalizeText";
import { ocrPdfWithModel } from "@/lib/document/ocrPdf";

export async function extractPdf(filePath: string) {
  const buffer = await readFile(filePath);
  const result = await pdf(buffer);
  if (!result.text || !result.text.trim()) {
    // No text layer (scanned/image PDF). Try visual OCR via the model before
    // giving up; on failure fall back to a clear, actionable error.
    const ocrText = await ocrPdfWithModel(filePath).catch(() => null);
    if (ocrText && ocrText.trim()) {
      return buildExtractedDocument(ocrText, result.numpages);
    }
    const pages = result.numpages ?? 0;
    throw new Error(
      `该 PDF 共 ${pages} 页，未提取到文字层，视觉识别也未获得内容。请上传包含可复制文字的 PDF，或先用 OCR 将其转换为文字版后再导入。`
    );
  }
  return buildExtractedDocument(result.text, result.numpages);
}
