import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  listTutorConversations: vi.fn(),
  isTeacher: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  isTeacher: mocks.isTeacher,
  requireCourseAccess: mocks.requireCourseAccess
}));
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
import { teacherPrepWorkflows } from "../../src/lib/courseWorkspace/capabilities";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const baseCourse = {
  id: "course-1",
  ownerId: "teacher-1",
  title: "测试课程",
  status: "DRAFT",
  cover: null
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTutorConversations.mockResolvedValue([]);
  mocks.requireCourseAccess.mockResolvedValue(baseCourse);
  mocks.isTeacher.mockImplementation((user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN");
});

describe("AiWorkbenchPage", () => {
  it("renders one consolidated resource-and-AI section with four prep workflows", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("备课资源与 AI 能力");
    for (const workflow of teacherPrepWorkflows) {
      expect(html.match(new RegExp(`data-workflow-id="${workflow.id}"`, "g"))).toHaveLength(1);
      expect(html).toContain(`href="${workflow.route("course-1")}"`);
      expect(workflow.route("course-1")).toContain("/ai-workbench");
    }
    expect(html).toContain("AI出题与组卷");
    expect(html).toContain("AI课件");
    expect(html).not.toContain("继续处理");
    expect(html).not.toContain("创建教学内容");
    expect(html).not.toContain("管理备课成果");
    expect(html).not.toContain("AI助教");
    expect(html).not.toContain("已发布互动课件");
  });

  it("sends students directly to the tutor without teacher workflows", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ ...baseCourse, ownerId: "teacher-1" });

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("AI助教");
    expect(html).toContain("输入课程问题开始对话");
    expect(html).toContain("搜索课程资料");
    expect(html).not.toContain("备课资源与 AI 能力");
    expect(html).not.toContain("AI出题与组卷");
    expect(mocks.listTutorConversations).toHaveBeenCalledWith(expect.anything(), "course-1");
  });

  it("loads only the accessible course shell on the teacher homepage", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });

    await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) });

    expect(mocks.requireCourseAccess).toHaveBeenCalledOnce();
    expect(mocks.listTutorConversations).not.toHaveBeenCalled();
  });
});
