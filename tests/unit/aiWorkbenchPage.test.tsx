import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadCourseWorkspace: vi.fn(),
  listTutorConversations: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/courseWorkspace/data", () => ({ loadCourseWorkspace: mocks.loadCourseWorkspace }));
vi.mock("@/lib/permissions", () => ({ isTeacher: () => true }));
vi.mock("@/lib/courseWorkspace/aiConversation", () => ({
  listTutorConversations: mocks.listTutorConversations,
  toTutorConversationDto: vi.fn()
}));
vi.mock("@/components/course-workspace/FanyaCourseShell", () => ({
  FanyaCourseShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("@/components/course-workspace/AiWorkbench", () => ({
  AiWorkbench: () => <div data-testid="ai-workbench" />
}));
vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}));
vi.mock("@/components/ui/Button", () => ({
  LinkButton: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a data-testid="header-link-button" href={href}>{children}</a>
  )
}));
vi.mock("@/components/courses/CoursePublishButton", () => ({
  CoursePublishButton: () => <button type="button">发布课程</button>
}));

import AiWorkbenchPage from "../../src/app/space/courses/[courseId]/ai-workbench/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("AiWorkbenchPage", () => {
  it("keeps the document import card but omits the duplicate header button", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.loadCourseWorkspace.mockResolvedValue({
      id: "course-1",
      ownerId: "teacher-1",
      title: "测试课程",
      status: "DRAFT",
      chapters: [],
      resources: [],
      enrollments: [],
      announcements: [],
      aiArtifacts: []
    });
    mocks.listTutorConversations.mockResolvedValue([]);

    const html = renderToStaticMarkup(
      await AiWorkbenchPage({ params: Promise.resolve({ courseId: "course-1" }) })
    );

    expect(html).toContain("AI文档建课");
    expect(html).toContain("/space/courses/course-1/ai-import");
    expect(html).not.toContain('data-testid="header-link-button"');
  });
});
