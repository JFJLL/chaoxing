import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openDocument: vi.fn(),
  documentDestroy: vi.fn(),
  pageDestroy: vi.fn(),
  structuredDestroy: vi.fn(),
  countPages: vi.fn(),
  loadPage: vi.fn(),
  toStructuredText: vi.fn(),
  asText: vi.fn()
}));

vi.mock("mupdf", () => ({
  default: { Document: { openDocument: mocks.openDocument } }
}));

import { extractPdf, PdfHasNoTextLayerError } from "@/lib/document/extractPdf";

function structuredText(text: string) {
  return {
    asText: () => text,
    destroy: mocks.structuredDestroy
  };
}

function page(text: string) {
  return {
    toStructuredText: () => structuredText(text),
    destroy: mocks.pageDestroy
  };
}

function documentWithPages(pages: string[]) {
  return {
    countPages: () => pages.length,
    loadPage: (index: number) => page(pages[index] ?? ""),
    destroy: mocks.documentDestroy
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.documentDestroy.mockImplementation(() => undefined);
  mocks.pageDestroy.mockImplementation(() => undefined);
  mocks.structuredDestroy.mockImplementation(() => undefined);
  mocks.openDocument.mockReturnValue(documentWithPages([]));
});

describe("extractPdf (mupdf)", () => {
  it("throws a typed no-text-layer error (with page count) for a scanned PDF", async () => {
    mocks.openDocument.mockReturnValue(documentWithPages(["  ", "\n\t", ""]));
    await expect(extractPdf("/tmp/scan.pdf")).rejects.toBeInstanceOf(PdfHasNoTextLayerError);
    await expect(extractPdf("/tmp/scan.pdf")).rejects.toMatchObject({ pages: 3 });
  });

  it("returns the extracted document with page-numbered chunks for a text-layer PDF", async () => {
    mocks.openDocument.mockReturnValue(documentWithPages([
      "第一章 概述\n\n基础知识。",
      "第二章 方法\n\n实践步骤。",
      "   "
    ]));
    const result = await extractPdf("/tmp/text.pdf");
    expect(result.text).toContain("第一章 概述");
    expect(result.text).toContain("第二章 方法");
    expect(result.pages).toBe(3);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.pageChunks?.length).toBeGreaterThan(0);
    expect(result.pageChunks?.every((chunk) => chunk.page >= 1 && chunk.page <= 2)).toBe(true);
    expect(result.pageChunks?.some((chunk) => chunk.page === 2 && chunk.text.includes("第二章"))).toBe(true);
  });

  it("opens the file by path and releases every mupdf resource", async () => {
    mocks.openDocument.mockReturnValue(documentWithPages(["正文"]));
    await extractPdf("/tmp/large.pdf");
    expect(mocks.openDocument).toHaveBeenCalledWith("/tmp/large.pdf");
    expect(mocks.documentDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.pageDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.structuredDestroy).toHaveBeenCalledTimes(1);
  });
});
