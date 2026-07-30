import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { buildExtractedDocument } from "@/lib/document/normalizeText";

export async function extractPdf(filePath: string) {
  const buffer = await readFile(filePath);
  const result = await pdf(buffer);
  if (!result.text || !result.text.trim()) {
    const pages = result.numpages ?? 0;
    // pdf-parse ran but found no text layer. This is almost always a scanned /
    // image-only PDF, so give a specific, actionable message instead of the
    // generic "文档内容为空" which reads like a system fault.
    throw new Error(
      `该 PDF 共 ${pages} 页，但未提取到任何文字，通常是扫描件或图片版 PDF（没有文字层）。请上传包含可复制文字的 PDF，或先用 OCR 将其转换为文字版后再导入。`
    );
  }
  return buildExtractedDocument(result.text, result.numpages);
}
