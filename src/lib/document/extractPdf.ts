import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { buildExtractedDocument } from "@/lib/document/normalizeText";

/**
 * Raised when a PDF has no extractable text layer (scanned / image-only). The
 * import worker catches this to fall back to generating the outline directly
 * from the PDF via a multimodal model, instead of failing.
 */
export class PdfHasNoTextLayerError extends Error {
  constructor(readonly pages: number) {
    super(`该 PDF 共 ${pages} 页，没有可提取的文字层（扫描件或图片版）`);
    this.name = "PdfHasNoTextLayerError";
  }
}

export async function extractPdf(filePath: string) {
  const buffer = await readFile(filePath);
  const result = await pdf(buffer);
  if (!result.text || !result.text.trim()) {
    throw new PdfHasNoTextLayerError(result.numpages ?? 0);
  }
  return buildExtractedDocument(result.text, result.numpages);
}
