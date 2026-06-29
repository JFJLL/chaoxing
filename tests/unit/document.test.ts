import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { extractText } from "../../src/lib/document/extractText";
import { buildExtractedDocument, normalizeText, splitIntoChunks } from "../../src/lib/document/normalizeText";
import { assertSupportedUpload, assertUploadSize } from "../../src/lib/storage";

function zipEntry(name: string, content: string) {
  const nameBuffer = Buffer.from(name, "utf8");
  const raw = Buffer.from(content, "utf8");
  const compressed = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);

  const localEntry = Buffer.concat([local, nameBuffer, compressed]);
  const centralEntry = Buffer.concat([central, nameBuffer]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralEntry.length, 12);
  end.writeUInt32LE(localEntry.length, 16);
  return Buffer.concat([localEntry, centralEntry, end]);
}

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

  it("extracts text from PPTX slide XML", async () => {
    const dir = ".uploads/test";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `slides-${Date.now()}.pptx`);
    await writeFile(
      filePath,
      zipEntry("ppt/slides/slide1.xml", '<p:sld><a:t>课程导入</a:t><a:t>知识导图 &amp; HTML课件</a:t></p:sld>')
    );

    const extracted = await extractText(filePath, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(extracted.text).toContain("课程导入");
    expect(extracted.text).toContain("知识导图 & HTML课件");
    expect(extracted.pages).toBe(1);
  });

  it("accepts PPTX uploads and enforces max upload size", () => {
    expect(assertSupportedUpload("course.pptx")).toBe(".pptx");
    const previousMaxFileSize = process.env.MAX_FILE_SIZE_MB;
    process.env.MAX_FILE_SIZE_MB = "1";
    expect(() => assertUploadSize(2 * 1024 * 1024)).toThrow("文件不能超过 1MB");
    process.env.MAX_FILE_SIZE_MB = previousMaxFileSize;
  });
});
