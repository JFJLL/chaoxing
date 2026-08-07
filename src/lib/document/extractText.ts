import { readFile } from "fs/promises";
import { extname } from "path";
import { buildExtractedDocument } from "@/lib/document/normalizeText";
import { extractDocx } from "@/lib/document/extractDocx";
import { extractPdf } from "@/lib/document/extractPdf";
import { extractPptx } from "@/lib/document/extractPptx";

export type ExtractedDocument = {
  text: string;
  pages?: number;
  wordCount: number;
  chunks: string[];
  /**
   * Page-aligned chunks (text + 1-based page) for knowledge indexing. Only
   * formats that carry page information (PDF) populate this; other formats
   * leave it undefined so the knowledge indexer falls back to plain chunks.
   */
  pageChunks?: Array<{ text: string; page: number }>;
};

export async function extractText(filePath: string, mimeType?: string | null): Promise<ExtractedDocument> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(filePath);
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return extractPdf(filePath);
  }

  if (extension === ".pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return extractPptx(filePath);
  }

  if (extension === ".txt" || extension === ".md" || mimeType?.startsWith("text/")) {
    return buildExtractedDocument(await readFile(filePath, "utf8"));
  }

  throw new Error("不支持的文档类型");
}
