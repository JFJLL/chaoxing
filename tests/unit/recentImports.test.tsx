import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBatches: vi.fn(),
  findImports: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    documentImportBatch: { findMany: mocks.findBatches },
    documentImportJob: { findMany: mocks.findImports }
  }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { RecentImports } from "@/components/ai-import/RecentImports";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBatches.mockResolvedValue([]);
  mocks.findImports.mockResolvedValue([]);
});

describe("RecentImports batch aggregation", () => {
  it("renders one card for a batch with two documents", async () => {
    mocks.findBatches.mockResolvedValue([{
      id: "batch-1",
      status: "READY_FOR_REVIEW",
      createdAt: new Date("2026-07-13T02:00:00.000Z"),
      generatedOutlineVersion: 1,
      documents: [
        { id: "job-1", originalName: "国家级大创.pdf", status: "READY_FOR_REVIEW", errorMessage: null },
        { id: "job-2", originalName: "策划案.pdf", status: "READY_FOR_REVIEW", errorMessage: null }
      ]
    }]);

    const html = renderToStaticMarkup(await RecentImports({ courseId: "course-1" }));
    expect(html).toContain("本次导入 · 2份资料");
    expect(countOccurrences(html, "本次导入 · ")).toBe(1);
    // The whole-batch status drives the label, not the first document's status.
    expect(html).toContain("待确认");
    expect(countOccurrences(html, "查看并确认")).toBe(1);
    // "查看并确认" enters the representative job's review page.
    expect(html).toContain('href="/space/courses/course-1/ai-import/job-1#outline-review"');
  });

  it("uses the batch status even when a document is still processing", async () => {
    mocks.findBatches.mockResolvedValue([{
      id: "batch-2",
      status: "COMBINING",
      createdAt: new Date("2026-07-13T03:00:00.000Z"),
      generatedOutlineVersion: 0,
      documents: [
        { id: "job-3", originalName: "甲.pdf", status: "READY_FOR_REVIEW", errorMessage: null },
        { id: "job-4", originalName: "乙.pdf", status: "MAPPING", errorMessage: null }
      ]
    }]);

    const html = renderToStaticMarkup(await RecentImports({ courseId: "course-1" }));
    expect(html).toContain("正在综合多份资料并生成课程目录");
    expect(html).toContain("查看进度");
  });

  it("still shows legacy batchId=null jobs as single-document imports", async () => {
    mocks.findImports.mockResolvedValue([{
      id: "legacy-1",
      originalName: "历史资料.docx",
      status: "APPLIED",
      errorMessage: null,
      createdAt: new Date("2026-07-13T01:00:00.000Z")
    }]);

    const html = renderToStaticMarkup(await RecentImports({ courseId: "course-1" }));
    expect(html).toContain("历史单文档导入 · 历史资料.docx");
    expect(html).toContain('href="/space/courses/course-1/ai-import/legacy-1#outline-review"');
  });

  it("caps recent items at five batches rather than counting files", async () => {
    mocks.findBatches.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({
      id: `batch-${index}`,
      status: "READY_FOR_REVIEW",
      createdAt: new Date(Date.UTC(2026, 6, 13, index)),
      generatedOutlineVersion: 1,
      documents: [
        { id: `job-${index}-a`, originalName: "甲.pdf", status: "READY_FOR_REVIEW", errorMessage: null },
        { id: `job-${index}-b`, originalName: "乙.pdf", status: "READY_FOR_REVIEW", errorMessage: null }
      ]
    })));

    const html = renderToStaticMarkup(await RecentImports({ courseId: "course-1" }));
    expect(countOccurrences(html, "本次导入 · 2份资料")).toBe(5);
  });
});
