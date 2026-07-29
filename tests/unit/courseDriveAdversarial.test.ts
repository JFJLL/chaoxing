import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDriveFiles: vi.fn(),
  findCourses: vi.fn(),
  findRules: vi.fn(),
  createDriveFile: vi.fn(),
  requireCourseAccess: vi.fn(),
  requireCourseManager: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    driveFile: { findMany: mocks.findDriveFiles, create: mocks.createDriveFile },
    course: { findMany: mocks.findCourses },
    courseDriveAccessRule: { findMany: mocks.findRules }
  }
}));
vi.mock("@/lib/permissions", () => ({
  isTeacher: (user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN",
  isCourseManagerRecord: (user: { id: string; role: string }, course: { ownerId: string; collaborators?: Array<{ userId: string }> }) =>
    user.role === "ADMIN" || course.ownerId === user.id || Boolean(course.collaborators?.some((item) => item.userId === user.id)),
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseManager: mocks.requireCourseManager
}));

import { assertDriveMoveAllowed } from "@/lib/copilot/files";
import { createCourseDriveFolder, listCourseDriveChildren, listCourseDrivePicker } from "@/lib/courseDrive/service";

const node = (id: string, parentId: string | null, kind = "folder") => ({
  id,
  ownerId: "teacher-1",
  parentId,
  name: id,
  kind,
  mimeType: kind === "file" ? "text/plain" : null,
  size: 0,
  path: null,
  deletedAt: null
});

describe("course drive adversarial boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCourseAccess.mockResolvedValue({
      id: "course-a",
      ownerId: "teacher-1",
      institutionId: "institution-1",
      driveRootFolderId: "root-a",
      status: "ACTIVE"
    });
    mocks.requireCourseManager.mockResolvedValue({
      id: "course-a",
      ownerId: "teacher-1",
      institutionId: "institution-1",
      driveRootFolderId: "root-a",
      status: "ACTIVE"
    });
  });

  it("blocks bound roots and cross-course moves while allowing an unbound file to enter a course", async () => {
    mocks.findDriveFiles.mockResolvedValue([
      node("root-a", null),
      node("file-a", "root-a", "file"),
      node("root-b", null),
      node("folder-b", "root-b"),
      node("loose", null, "file")
    ]);
    mocks.findCourses.mockResolvedValue([
      { driveRootFolderId: "root-a" },
      { driveRootFolderId: "root-b" }
    ]);

    await expect(assertDriveMoveAllowed("teacher-1", "root-a", "folder-b"))
      .rejects.toThrow("课程云盘根目录不能通过普通移动操作变更");
    await expect(assertDriveMoveAllowed("teacher-1", "file-a", "folder-b"))
      .rejects.toThrow("不能移出或移动到其他课程云盘");
    await expect(assertDriveMoveAllowed("teacher-1", "loose", "root-a")).resolves.toBeUndefined();
  });

  it("uses the root as a traversal container and filters each child by unified access", async () => {
    mocks.findDriveFiles.mockResolvedValue([
      node("root-a", null),
      node("allowed", "root-a", "file"),
      node("denied", "root-a", "file")
    ]);
    mocks.findRules.mockResolvedValue([
      { driveFileId: "allowed", access: "ALLOW" }
    ]);

    const result = await listCourseDriveChildren({
      id: "student-1",
      name: "学生",
      role: "STUDENT",
      institutionId: "institution-1"
    }, "course-a");

    expect(result.parent.id).toBe("root-a");
    expect(result.items.map((item) => item.id)).toEqual(["allowed"]);
  });

  it("lists only importable files when the document picker requests documents", async () => {
    mocks.findDriveFiles.mockResolvedValue([
      node("root-a", null),
      node("chapter-folder", "root-a"),
      { ...node("lesson.md", "chapter-folder", "file"), name: "lesson.md" },
      { ...node("video.mp4", "root-a", "file"), name: "video.mp4" }
    ]);
    mocks.findRules.mockResolvedValue([]);

    const result = await listCourseDrivePicker({
      id: "teacher-1",
      name: "教师",
      role: "TEACHER",
      institutionId: "institution-1"
    }, "course-a", { documentsOnly: true });

    expect(result.map((item) => item.name)).toEqual(["lesson.md"]);
  });

  it("lets a same-institution collaborator create inside the owner-backed course root", async () => {
    mocks.findDriveFiles.mockResolvedValue([node("root-a", null)]);
    mocks.createDriveFile.mockResolvedValue({ id: "folder-new", parentId: "root-a", name: "协作资料" });

    await expect(createCourseDriveFolder({
      id: "teacher-2",
      name: "协作教师",
      role: "TEACHER",
      institutionId: "institution-1"
    }, "course-a", "root-a", " 协作资料 ")).resolves.toMatchObject({ id: "folder-new" });

    expect(mocks.createDriveFile).toHaveBeenCalledWith({
      data: {
        ownerId: "teacher-1",
        parentId: "root-a",
        name: "协作资料",
        kind: "folder"
      }
    });
  });

  it("rejects a cross-institution collaborator before reading or mutating the owner drive", async () => {
    await expect(createCourseDriveFolder({
      id: "teacher-2",
      name: "外部教师",
      role: "TEACHER",
      institutionId: "institution-2"
    }, "course-a", "root-a", "越权资料"))
      .rejects.toMatchObject({ code: "COURSE_DRIVE_INSTITUTION_MISMATCH", status: 403 });

    expect(mocks.findDriveFiles).not.toHaveBeenCalled();
    expect(mocks.createDriveFile).not.toHaveBeenCalled();
  });
});
