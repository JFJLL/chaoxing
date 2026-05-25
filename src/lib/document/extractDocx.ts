import mammoth from "mammoth";
import { buildExtractedDocument } from "@/lib/document/normalizeText";

export async function extractDocx(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath });
  return buildExtractedDocument(result.value);
}
