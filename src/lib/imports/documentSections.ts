import { createHash } from "crypto";

export type ParsedDocumentSection = {
  id: string;
  title: string;
  order: number;
  text: string;
  startOffset: number;
  endOffset: number;
  confidence?: number;
};

type SectionDraft = Omit<ParsedDocumentSection, "id" | "order">;

function stableSectionId(documentId: string, section: SectionDraft) {
  const digest = createHash("sha256")
    .update(documentId)
    .update("\0")
    .update(String(section.startOffset))
    .update("\0")
    .update(String(section.endOffset))
    .update("\0")
    .update(section.text)
    .digest("hex")
    .slice(0, 24);
  return `section_${digest}`;
}

function trimmedRange(text: string, startOffset: number, endOffset: number) {
  let start = startOffset;
  let end = endOffset;
  while (start < end && /\s/.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return { start, end };
}

function headingTitle(line: string) {
  const markdown = line.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return markdown[1]?.trim() ?? "";
  return line.trim();
}

function isHeading(line: string) {
  const value = line.trim();
  if (!value || value.length > 100) return false;
  return /^(?:#{1,6}\s+\S|第[一二三四五六七八九十百千万\d]+[章节单元篇部课](?:\s*\S.*)?$|[一二三四五六七八九十]+、\S|\d+(?:\.\d+){0,2}(?:[、.．]|\s+)\s*\S)/.test(value);
}

function headingSections(text: string): SectionDraft[] {
  const headings: Array<{ offset: number; title: string }> = [];
  for (const match of text.matchAll(/(^|\n)([^\n]+)/g)) {
    const line = match[2] ?? "";
    if (!isHeading(line)) continue;
    headings.push({
      offset: (match.index ?? 0) + (match[1]?.length ?? 0),
      title: headingTitle(line)
    });
  }
  if (!headings.length) return [];

  const boundaries = headings[0]!.offset > 0
    ? [{ offset: 0, title: "导言" }, ...headings]
    : headings;
  return boundaries.flatMap((heading, index) => {
    const range = trimmedRange(text, heading.offset, boundaries[index + 1]?.offset ?? text.length);
    if (range.start >= range.end) return [];
    return [{
      title: heading.title || `第 ${index + 1} 节`,
      text: text.slice(range.start, range.end),
      startOffset: range.start,
      endOffset: range.end,
      confidence: 0.9
    }];
  });
}

function chunkSections(text: string, chunks: string[]): SectionDraft[] {
  const usableChunks = chunks.map((chunk) => chunk.trim()).filter(Boolean);
  if (usableChunks.length <= 1) {
    const range = trimmedRange(text, 0, text.length);
    return range.start < range.end ? [{
      title: "全文",
      text: text.slice(range.start, range.end),
      startOffset: range.start,
      endOffset: range.end,
      confidence: 1
    }] : [];
  }

  let cursor = 0;
  const sections: SectionDraft[] = [];
  for (const [index, chunk] of usableChunks.entries()) {
    const found = text.indexOf(chunk, cursor);
    if (found < 0) return chunkSections(text, [text]);
    const range = trimmedRange(text, found, found + chunk.length);
    sections.push({
      title: `第 ${index + 1} 部分`,
      text: text.slice(range.start, range.end),
      startOffset: range.start,
      endOffset: range.end,
      confidence: 0.65
    });
    cursor = found + chunk.length;
  }
  return sections;
}

export function buildDocumentSections({
  documentId,
  text,
  chunks
}: {
  documentId: string;
  text: string;
  chunks: string[];
}): ParsedDocumentSection[] {
  const drafts = headingSections(text);
  const sections = drafts.length ? drafts : chunkSections(text, chunks);
  return sections.map((section, index) => ({
    id: stableSectionId(documentId, section),
    order: index + 1,
    ...section
  }));
}

function isStoredSection(value: unknown): value is ParsedDocumentSection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  const allowedKeys = new Set(["id", "title", "order", "text", "startOffset", "endOffset", "confidence"]);
  if (Object.keys(section).some((key) => !allowedKeys.has(key))) return false;
  return typeof section.id === "string" && section.id.trim().length > 0
    && typeof section.title === "string" && section.title.trim().length > 0
    && Number.isInteger(section.order) && Number(section.order) > 0
    && typeof section.text === "string" && section.text.length > 0
    && Number.isInteger(section.startOffset) && Number(section.startOffset) >= 0
    && Number.isInteger(section.endOffset) && Number(section.endOffset) > Number(section.startOffset)
    && section.text.length === Number(section.endOffset) - Number(section.startOffset)
    && (section.confidence === undefined
      || (typeof section.confidence === "number" && Number.isFinite(section.confidence) && section.confidence >= 0 && section.confidence <= 1));
}

export function parseStoredDocumentSections(raw: string | null): ParsedDocumentSection[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.length || !value.every(isStoredSection)) return [];
    const ids = new Set(value.map((section) => section.id));
    const orders = new Set(value.map((section) => section.order));
    if (ids.size !== value.length || orders.size !== value.length) return [];
    if (!value.every((section, index) => section.order === index + 1)) return [];
    return value;
  } catch {
    return [];
  }
}
