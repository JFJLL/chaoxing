import { readFile } from "fs/promises";
import { extname } from "path";
import { buildExtractedDocument } from "@/lib/document/normalizeText";
import { extractDocx } from "@/lib/document/extractDocx";
import { extractPdf } from "@/lib/document/extractPdf";

export type ExtractedDocument = {
  text: string;
  pages?: number;
  wordCount: number;
  chunks: string[];
};

export async function extractText(filePath: string, mimeType?: string | null): Promise<ExtractedDocument> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(filePath);
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return extractPdf(filePath);
  }

  if (extension === ".txt" || extension === ".md" || mimeType?.startsWith("text/")) {
    return buildExtractedDocument(await readFile(filePath, "utf8"));
  }

  throw new Error("不支持的文档类型");
}
