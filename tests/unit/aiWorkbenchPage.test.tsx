import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadCourseWorkspace: vi.fn(),
  listTutorConversations: vi.fn(),
  isTeacher: vi.fn(),
  findImportJobs: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/courseWorkspace/data", () => ({ loadCourseWorkspace: mocks.loadCourseWorkspace }));
vi.mock("@/lib/permissions", () => ({ isTeacher: mocks.isTeacher }));
vi.mock("@/lib/db", () => ({ db: { documentImportJob: { findMany: mocks.findImportJobs } } }));
vi.mock("@/lib/courseWorkspace/aiConversation", () => ({
  listTutorConversations: mocks.listTutorConversations,
  toTutorConversationDto: (conversation: unknown) => conversation
}));
vi.mock("@/components/course-workspace/FanyaCourseShell", () => ({
  FanyaCourseShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("@/components/courses/CoursePublishButton", () => ({
  CoursePublishButton: () => <button type="button">发布课程</button>
}));

import AiWorkbenchPage from "../../src/app/space/courses/[courseId]/ai-workbench/page";
import { courseCapabilities } from "../../src/lib/courseWorkspace/capabilities";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const baseCourse = {
  id: "course-1",
  ownerId: "teacher-1",
  title: "测试课程",
  status: "DRAFT",
  chapters: [],
  resources: [],
  enrollments: [],
  announcements: [],
  aiArtifacts: []
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findImportJobs.mockResolvedValue([]);
  mocks.listTutorConversations.mockResolvedValue([]);
  mocks.loadCourseWorkspace.mockResolvedValue(baseCourse);
  mocks.isTeacher.mockImplementation((user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN");
});

describe("AiWorkbenchPage", () => {
  it("renders each enabled teacher capability exactly once without the old tab hierarchy", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    const teacherCapabilities = courseCapabilities.filter((capability) => capability.enabled && capability.audience.includes("teacher"));
    for (const capability of teacherCapabilities) {
      expect(html.match(new RegExp(`data-capability-id="${capability.id}"`, "g"))).toHaveLength(1);
      expect(html).toContain(`href="${capability.route("course-1")}"`);
    }
    expect(html).toContain("AI组卷");
    expect(html).toContain("生成互动课件");
    expect(html).toContain("已发布互动课件");
    expect(html).toContain('href="/space/courses/course-1/ai-workbench/tutor"');
    expect(html).not.toContain("AI应用");
    expect(html).not.toContain("AI实践");
    expect(html).not.toContain("AI学情分析");
  });

  it("sends students directly to the tutor without teacher inventory or a second-level tab", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.loadCourseWorkspace.mockResolvedValue({ ...baseCourse, ownerId: "teacher-1" });

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("AI助教");
    expect(html).toContain("输入课程问题开始对话");
    expect(html).toContain("搜索课程资料");
    expect(html).not.toContain("继续处理");
    expect(html).not.toContain("创建教学内容");
    expect(html).not.toContain("学生数");
    expect(html).not.toContain("AI产物");
    expect(mocks.findImportJobs).not.toHaveBeenCalled();
    expect(mocks.listTutorConversations).toHaveBeenCalled();
  });

  it("deduplicates repeated failed imports so continue-processing does not become a history dump", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.findImportJobs.mockResolvedValue([
      { id: "job-new", originalName: "recovery.md", status: "FAILED", currentStage: "导入失败", updatedAt: new Date("2026-07-16T02:00:00.000Z") },
      { id: "job-old", originalName: "recovery.md", status: "FAILED", currentStage: "导入失败", updatedAt: new Date("2026-07-15T02:00:00.000Z") }
    ]);

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html.match(/recovery\.md/g)).toHaveLength(1);
    expect(html).toContain("/ai-import/job-new");
    expect(html).not.toContain("/ai-import/job-old");
  });
});
