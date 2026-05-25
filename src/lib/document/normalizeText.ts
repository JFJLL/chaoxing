import type { ExtractedDocument } from "@/lib/document/extractText";

const MAX_CHUNK_LENGTH = 12_000;

export function normalizeText(rawText: string) {
  const text = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^\d+$/.test(line))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new Error("文档内容为空，无法解析");
  }

  return text;
}

export function splitIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH) {
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of text.split(/\n{2,}/)) {
    if (!paragraph) continue;
    if ((current + "\n\n" + paragraph).trim().length > maxLength && current) {
      chunks.push(current.trim());
      current = "";
    }

    if (paragraph.length > maxLength) {
      for (let index = 0; index < paragraph.length; index += maxLength) {
        chunks.push(paragraph.slice(index, index + maxLength));
      }
    } else {
      current = `${current}\n\n${paragraph}`.trim();
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

export function buildExtractedDocument(rawText: string, pages?: number): ExtractedDocument {
  const text = normalizeText(rawText);
  return {
    text,
    pages,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    chunks: splitIntoChunks(text)
  };
}
