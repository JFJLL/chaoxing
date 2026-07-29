import { describe, expect, it } from "vitest";
import {
  buildDocumentSections,
  parseStoredDocumentSections
} from "@/lib/imports/documentSections";

describe("document sections", () => {
  it("builds deterministic sections from real heading-delimited source text", () => {
    const text = "课程导读\n\n# 第一章 基础\n这是第一章原文。\n\n## 1.1 概念\n这是概念原文。";
    const input = { documentId: "document-1", text, chunks: [text] };

    const first = buildDocumentSections(input);
    const second = buildDocumentSections(input);

    expect(second).toEqual(first);
    expect(first.map((section) => section.title)).toEqual(["导言", "第一章 基础", "1.1 概念"]);
    expect(first.map((section) => section.order)).toEqual([1, 2, 3]);
    for (const section of first) {
      expect(section.id).toMatch(/^section_[a-f0-9]{24}$/);
      expect(section.text).toBe(text.slice(section.startOffset, section.endOffset));
      expect(section.text.length).toBeGreaterThan(0);
    }
  });

  it("uses extracted chunk boundaries when no headings are present", () => {
    const chunks = ["第一段真实内容。", "第二段真实内容。"];
    const text = chunks.join("\n\n");

    const sections = buildDocumentSections({ documentId: "document-2", text, chunks });

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.title)).toEqual(["第 1 部分", "第 2 部分"]);
    expect(sections.map((section) => section.text)).toEqual(chunks);
  });

  it("recognizes numbered source headings without relying on an AI outline", () => {
    const text = "1.1 核心概念\n这里是概念原文。\n\n1.2 应用\n这里是应用原文。";

    const sections = buildDocumentSections({ documentId: "document-numbered", text, chunks: [text] });

    expect(sections.map((section) => section.title)).toEqual(["1.1 核心概念", "1.2 应用"]);
    expect(sections[0]?.text).toContain("这里是概念原文");
    expect(sections[1]?.text).toContain("这里是应用原文");
  });

  it("always creates a full-text section for a single plain-text chunk", () => {
    const text = "这里只有一段没有标题的真实原文。";

    const sections = buildDocumentSections({ documentId: "document-3", text, chunks: [text] });

    expect(sections).toMatchObject([{
      title: "全文",
      order: 1,
      text,
      startOffset: 0,
      endOffset: text.length
    }]);
  });

  it("strictly accepts the new persisted shape and rejects legacy chunk arrays", () => {
    const text = "真实原文";
    const sections = buildDocumentSections({ documentId: "document-4", text, chunks: [text] });

    expect(parseStoredDocumentSections(JSON.stringify(sections))).toEqual(sections);
    expect(parseStoredDocumentSections(JSON.stringify(["旧版原始 chunk"]))).toEqual([]);
    expect(parseStoredDocumentSections(JSON.stringify([{ ...sections[0], endOffset: 999 }]))).toEqual([]);
    expect(parseStoredDocumentSections(JSON.stringify([{ ...sections[0], unexpected: true }]))).toEqual([]);
    expect(parseStoredDocumentSections("not-json")).toEqual([]);
    expect(parseStoredDocumentSections(null)).toEqual([]);
  });
});
