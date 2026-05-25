import { describe, expect, it } from "vitest";
import { buildExtractedDocument, normalizeText, splitIntoChunks } from "../../src/lib/document/normalizeText";

describe("document text normalization", () => {
  it("collapses repeated whitespace", () => {
    expect(normalizeText(" 第一段   有   空格 \n\n\n 第二段\t内容 ")).toBe("第一段 有 空格\n\n第二段 内容");
  });

  it("removes page-number-only lines", () => {
    expect(normalizeText("标题\n1\n正文\n23\n结尾")).toBe("标题\n正文\n结尾");
  });

  it("splits long text into chunks under 12000 characters", () => {
    const chunks = splitIntoChunks("a".repeat(25_000), 12_000);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 12_000)).toBe(true);
  });

  it("rejects empty extracted text", () => {
    expect(() => buildExtractedDocument(" \n 1 \n 2 \n")).toThrow("文档内容为空");
  });
});
