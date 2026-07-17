import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadCourseWorkspace: vi.fn(),
  isTeacher: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/courseWorkspace/data", () => ({ loadCourseWorkspace: mocks.loadCourseWorkspace }));
vi.mock("@/lib/permissions", () => ({ isTeacher: mocks.isTeacher }));
vi.mock("@/components/course-workspace/FanyaCourseShell", () => ({
  FanyaCourseShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import ActivitiesPage from "../../src/app/space/courses/[courseId]/activities/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const course = { id: "course-1", title: "测试课程", ownerId: "teacher-1", status: "ACTIVE", chapters: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCourseWorkspace.mockResolvedValue(course);
  mocks.isTeacher.mockImplementation((user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN");
});

describe("ActivitiesPage", () => {
  it("places the teacher AI tutor in the classroom workflow", async () => {
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });

    const html = renderToStaticMarkup(await ActivitiesPage({ params: Promise.resolve({ courseId: "course-1" }) }));

    expect(html).toContain("AI助教");
    expect(html).toContain('href="/space/courses/course-1/activities/tutor"');
    expect(html).toContain("Copilot");
    expect(html).toContain('href="/space/courses/course-1/activities/copilot"');
    expect(html).not.toContain("AI陪练");
    expect(html).toContain("签到");
    expect(html).toContain("hover:-translate-y-0.5");
    expect(html).toContain("hover:shadow-floating");
    expect(html).toContain("group-hover:translate-x-0.5");
  });

  it("keeps the teacher-only tutor card out of the student classroom page", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });

    const html = renderToStaticMarkup(await ActivitiesPage({ params: Promise.resolve({ courseId: "course-1" }) }));

    expect(html).not.toContain('href="/space/courses/course-1/activities/tutor"');
    expect(html).toContain("Copilot");
    expect(html).toContain('href="/space/courses/course-1/activities/copilot"');
    expect(html).not.toContain("AI陪练");
    expect(html).toContain("签到");
  });
});
