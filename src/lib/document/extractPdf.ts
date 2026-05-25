import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { buildExtractedDocument } from "@/lib/document/normalizeText";

export async function extractPdf(filePath: string) {
  const buffer = await readFile(filePath);
  const result = await pdf(buffer);
  return buildExtractedDocument(result.text, result.numpages);
}
