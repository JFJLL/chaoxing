import mupdf from "mupdf";
import { buildPageExtractedDocument } from "@/lib/document/normalizeText";

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
  // MuPDF's WASM binding reads the file page by page from disk instead of
  // materialising the whole PDF in a JS Buffer, which keeps the memory peak
  // bounded even for very large textbooks.
  const document = mupdf.Document.openDocument(filePath);
  try {
    const pageCount = document.countPages();
    const pages: Array<{ page: number; text: string }> = [];
    for (let index = 0; index < pageCount; index += 1) {
      const page = document.loadPage(index);
      try {
        const structured = page.toStructuredText("preserve-whitespace");
        try {
          pages.push({ page: index + 1, text: structured.asText() });
        } finally {
          structured.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    if (!pages.some(({ text }) => text && text.trim())) {
      throw new PdfHasNoTextLayerError(pageCount);
    }
    return buildPageExtractedDocument(pages, pageCount);
  } finally {
    document.destroy();
  }
}
