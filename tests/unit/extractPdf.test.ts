import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), readFile: vi.fn() }));

vi.mock("pdf-parse", () => ({ default: mocks.pdf }));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));

import { extractPdf, PdfHasNoTextLayerError } from "@/lib/document/extractPdf";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFile.mockResolvedValue(Buffer.from("%PDF-1.7"));
});

describe("extractPdf", () => {
  it("throws a typed no-text-layer error (with page count) for a scanned PDF", async () => {
    mocks.pdf.mockResolvedValue({ text: "   \n  ", numpages: 126 });
    await expect(extractPdf("/tmp/scan.pdf")).rejects.toBeInstanceOf(PdfHasNoTextLayerError);
    await expect(extractPdf("/tmp/scan.pdf")).rejects.toMatchObject({ pages: 126 });
  });

  it("returns the extracted document for a text-layer PDF", async () => {
    mocks.pdf.mockResolvedValue({ text: "第一章 概述\n\n第二章 方法", numpages: 3 });
    const result = await extractPdf("/tmp/text.pdf");
    expect(result.text).toContain("第一章 概述");
    expect(result.pages).toBe(3);
    expect(result.chunks.length).toBeGreaterThan(0);
  });
});
