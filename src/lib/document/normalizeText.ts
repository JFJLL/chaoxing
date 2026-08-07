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

/**
 * Splits text into fixed-size chunks with a sliding overlap. Used to build the
 * full-file FTS5 knowledge index so every part of a document (not just the
 * head) is searchable while boundary-spanning concepts still match.
 */
export function splitIntoOverlappingChunks(text: string, chunkSize = 900, overlap = 100) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += step) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + chunkSize / 2) end = boundary;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
  }
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

/**
 * Builds an extracted document from per-page text while keeping page numbers
 * attached to every knowledge chunk, so citations can point at a concrete page.
 */
export function buildPageExtractedDocument(
  rawPages: Array<{ page: number; text: string }>,
  totalPages?: number
): ExtractedDocument {
  const pages = rawPages
    .map(({ page, text }) => {
      try {
        return { page, text: normalizeText(text) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { page: number; text: string } => entry !== null && entry.text.length > 0);
  const text = pages.map(({ text }) => text).join("\n\n");
  return {
    text,
    pages: totalPages ?? (pages.at(-1)?.page ?? undefined),
    wordCount: text.split(/\s+/).filter(Boolean).length,
    chunks: splitIntoChunks(text),
    pageChunks: pages.flatMap(({ page, text: pageText }) =>
      splitIntoOverlappingChunks(pageText).map((chunk) => ({ page, text: chunk }))
    )
  };
}
