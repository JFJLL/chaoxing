import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCourseAccess: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("@/lib/permissions", () => ({
  isTeacher: (user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN",
  requireCourseAccess: mocks.requireCourseAccess
}));
vi.mock("@/lib/db", () => ({ db: { course: { findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";

describe("loadCourseWorkspace safe relation selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    mocks.findUnique.mockResolvedValue({ id: "course-1" });
  });

  it("never selects password hashes and limits related users to fields required by the UI", async () => {
    await loadCourseWorkspace(
      { id: "teacher-1", name: "教师", role: "TEACHER", institutionId: "institution-1" },
      "course-1"
    );

    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.include.owner.select).toEqual({ id: true, name: true, avatar: true, role: true });
    expect(query.include.announcements.include.author.select).toEqual({ id: true, name: true, avatar: true, role: true });
    expect(query.include.enrollments.include.user.select).toEqual({ id: true, name: true, email: true, avatar: true, role: true });
    expect(JSON.stringify(query)).not.toContain("passwordHash");
  });
});
