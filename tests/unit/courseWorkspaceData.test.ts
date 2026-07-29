import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCourseAccess: vi.fn(),
  isCourseManagerRecord: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("@/lib/permissions", () => ({
  isCourseManagerRecord: mocks.isCourseManagerRecord,
  requireCourseAccess: mocks.requireCourseAccess
}));
vi.mock("@/lib/db", () => ({ db: { course: { findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";

describe("loadCourseWorkspace safe relation selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1", collaborators: [] });
    mocks.isCourseManagerRecord.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue({ id: "course-1" });
  });

  it("never selects password hashes and limits related users to fields required by the UI", async () => {
    await loadCourseWorkspace(
      { id: "teacher-1", name: "教师", role: "TEACHER", institutionId: "institution-1" },
      "course-1"
    );

    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.include.owner.select).toEqual({ id: true, name: true, avatar: true, role: true });
    expect(query.include.collaborators).toEqual({
      where: { userId: "teacher-1" },
      select: { userId: true, role: true }
    });
    expect(query.include.announcements.include.author.select).toEqual({ id: true, name: true, avatar: true, role: true });
    expect(query.include.enrollments.include.user.select).toEqual({ id: true, name: true, email: true, avatar: true, role: true });
    expect(JSON.stringify(query)).not.toContain("passwordHash");
  });

  it("loads private course workspace rows for a verified collaborator without treating them as enrolled", async () => {
    const collaborator = { id: "teacher-2", name: "协作教师", role: "TEACHER" as const, institutionId: "institution-1" };
    mocks.requireCourseAccess.mockResolvedValue({
      id: "course-1",
      ownerId: "teacher-1",
      collaborators: [{ userId: collaborator.id, role: "EDITOR" }]
    });
    mocks.isCourseManagerRecord.mockReturnValue(true);

    await loadCourseWorkspace(collaborator, "course-1");

    expect(mocks.isCourseManagerRecord).toHaveBeenCalledWith(collaborator, expect.objectContaining({
      collaborators: [{ userId: collaborator.id, role: "EDITOR" }]
    }));
    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.include.announcements.where).toEqual({});
    expect(query.include.aiArtifacts.where).toEqual({});
    expect(query.include.enrollments).toBeDefined();
  });

  it("keeps unpublished workspace rows hidden from an enrolled student", async () => {
    const student = { id: "student-1", name: "学生", role: "STUDENT" as const, institutionId: "institution-1" };
    mocks.isCourseManagerRecord.mockReturnValue(false);

    await loadCourseWorkspace(student, "course-1");

    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.include.announcements.where).toMatchObject({ status: "PUBLISHED" });
    expect(query.include.aiArtifacts.where).toEqual({ status: "PUBLISHED" });
  });
});
