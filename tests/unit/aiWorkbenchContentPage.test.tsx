import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  findImports: vi.fn(),
  recoverImports: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("@/lib/db", () => ({
  db: { documentImportJob: { findMany: mocks.findImports } }
}));
vi.mock("@/lib/imports/importQueue", () => ({
  recoverImportJobsFromDatabase: mocks.recoverImports
}));
vi.mock("@/components/ai-import/UploadPanel", () => ({
  UploadPanel: () => <div>上传入口</div>
}));
vi.mock("@/components/ai-import/ImportTimeline", () => ({
  ImportTimeline: ({ status }: { status: string }) => <div>{status}</div>
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
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1", title: "测试课程" });
  mocks.findImports.mockResolvedValue([{
    id: "job-1",
    originalName: "课程资料.docx",
    status: "READY_FOR_REVIEW",
    errorMessage: null
  }]);
});

describe("AI workbench content page", () => {
  it("renders recent imports without recovering or starting queue work during page rendering", async () => {
    const html = renderToStaticMarkup(
      await RecentImports({ courseId: "course-1" })
    );

    expect(html).toContain("最近导入");
    expect(html).toContain("课程资料.docx");
    expect(html).toContain('href="/space/courses/course-1/ai-import/job-1"');
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
});
