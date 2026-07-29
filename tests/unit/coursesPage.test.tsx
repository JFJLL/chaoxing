import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  courseFindMany: vi.fn(),
  enrollmentFindMany: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ isTeacher: () => true }));
vi.mock("@/lib/db", () => ({
  db: {
    course: { findMany: mocks.courseFindMany },
    courseEnrollment: { findMany: mocks.enrollmentFindMany }
  }
}));
vi.mock("@/components/courses/CourseTabs", () => ({ CourseTabs: () => <nav>tabs</nav> }));
vi.mock("@/components/courses/NewCourseDialog", () => ({ NewCourseDialog: () => <button>new</button> }));
vi.mock("@/components/courses/AddCourseDialog", () => ({ AddCourseDialog: () => <button>add</button> }));
vi.mock("@/components/ui/EmptyState", () => ({ EmptyState: () => <p>empty</p> }));
vi.mock("@/components/courses/CourseCard", () => ({
  CourseCard: ({ course }: { course: { id: string; accessRole?: string } }) => (
    <article data-course={course.id}>{course.accessRole}</article>
  )
}));

import CoursesPage from "@/app/space/courses/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("courses page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.courseFindMany.mockResolvedValue([
      { id: "owned", ownerId: "teacher-1", collaborators: [] },
      { id: "shared", ownerId: "teacher-2", collaborators: [{ userId: "teacher-1" }] }
    ]);
  });

  it("renders owned and collaborated courses in the real taught-course page", async () => {
    const tree = await CoursesPage({ searchParams: Promise.resolve({ tab: "taught" }) });
    const html = renderToStaticMarkup(tree);

    expect(mocks.courseFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerId: "teacher-1" },
          { collaborators: { some: { userId: "teacher-1" } } }
        ]
      },
      include: {
        owner: true,
        enrollments: true,
        collaborators: {
          where: { userId: "teacher-1" },
          select: { userId: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    expect(html).toContain('data-course="owned">OWNER');
    expect(html).toContain('data-course="shared">COLLABORATOR');
  });
});
