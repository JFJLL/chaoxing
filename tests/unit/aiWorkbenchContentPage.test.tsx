import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  findImports: vi.fn(),
  findBatches: vi.fn(),
  recoverImports: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseManager: mocks.requireCourseManager }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportBatch: { findMany: mocks.findBatches },
    documentImportJob: { findMany: mocks.findImports }
  }
}));
vi.mock("@/lib/imports/importQueue", () => ({
  recoverImportJobsFromDatabase: mocks.recoverImports
}));
vi.mock("@/components/ai-import/UploadPanel", () => ({
  UploadPanel: () => <div>上传入口</div>
}));
vi.mock("@/components/ai-import/CourseDocumentImportSources", () => ({
  CourseDocumentImportSources: () => <div>多资料上传与云盘选择</div>
}));
vi.mock("@/components/ai-import/ImportTimeline", () => ({
  ImportTimeline: ({ status }: { status: string }) => <div>{status}</div>
}));
vi.mock("@/components/ai-import/DeleteImportRecordButton", () => ({
  DeleteImportRecordButton: () => <button type="button">删除记录</button>
}));
vi.mock("@/components/course-workspace/PrepWorkflowNavigation", () => ({
  PrepWorkflowNavigation: () => <nav>备课流程</nav>
}));

import { RecentImports } from "@/components/ai-import/RecentImports";
import AiWorkbenchContentPage from "@/app/space/courses/[courseId]/ai-workbench/content/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1", title: "测试课程" });
  mocks.findBatches.mockResolvedValue([]);
  mocks.findImports.mockResolvedValue([{
    id: "job-1",
    originalName: "课程资料.docx",
    status: "READY_FOR_REVIEW",
    errorMessage: null,
    createdAt: new Date("2026-07-13T00:00:00.000Z")
  }]);
});

describe("AI workbench content page", () => {
  it("renders recent imports without recovering or starting queue work during page rendering", async () => {
    const html = renderToStaticMarkup(
      await RecentImports({ courseId: "course-1" })
    );

    expect(html).toContain("最近导入");
    expect(html).toContain("课程资料.docx");
    expect(html).toContain('href="/space/courses/course-1/ai-import/job-1#outline-review"');
    expect(html).toContain("查看并确认");
    expect(mocks.recoverImports).not.toHaveBeenCalled();
  });

  it("waits for recent imports before returning the page instead of leaving a permanent loading fallback", async () => {
    const html = renderToStaticMarkup(
      await AiWorkbenchContentPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("课程资料.docx");
    expect(html).not.toContain("正在载入导入记录");
    expect(mocks.findImports).toHaveBeenCalledTimes(1);
  });

  it("exposes a dedicated maintenance entry to the course directory builder", async () => {
    const html = renderToStaticMarkup(
      await AiWorkbenchContentPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("维护课程目录");
    expect(html).toContain('href="/space/courses/course-1/builder"');
  });
});
