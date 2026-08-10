import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireOwner: vi.fn(),
  findMany: vi.fn(),
  findCourse: vi.fn(),
  deleteResource: vi.fn(),
  deleteShare: vi.fn(),
  softDelete: vi.fn(),
  transaction: vi.fn(),
  countNoticeReferences: vi.fn(),
  deleteStorage: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/modules/drivePermissions", () => ({
  requireDriveFileOwner: mocks.requireOwner,
  requireDriveFileReadable: vi.fn()
}));
vi.mock("@/lib/copilot/files", () => ({ assertDriveMoveAllowed: vi.fn() }));
vi.mock("@/lib/modules/driveFiles", () => ({
  deleteDriveFileFromStorage: mocks.deleteStorage,
  streamDriveFile: vi.fn()
}));
vi.mock("@/lib/db", () => ({
  db: {
    driveFile: { findMany: mocks.findMany, updateMany: mocks.softDelete, update: vi.fn() },
    course: { findFirst: mocks.findCourse },
    resource: { deleteMany: mocks.deleteResource },
    driveShare: { deleteMany: mocks.deleteShare },
    announcementAttachment: { count: mocks.countNoticeReferences },
    $transaction: mocks.transaction
  }
}));

import { DELETE } from "../../src/app/api/drive/[fileId]/route";

describe("drive deletion ordering", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.requireOwner.mockResolvedValue({ id: "file-1" });
    mocks.findMany.mockResolvedValue([{
      id: "file-1",
      parentId: null,
      kind: "file",
      name: "讲义.pdf",
      mimeType: "application/pdf",
      path: "D:/uploads/drive/file.pdf"
    }]);
    mocks.findCourse.mockResolvedValue(null);
    mocks.deleteResource.mockResolvedValue({ count: 0 });
    mocks.deleteShare.mockResolvedValue({ count: 0 });
    mocks.softDelete.mockResolvedValue({ count: 1 });
    mocks.countNoticeReferences.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("commits the soft delete before physical cleanup and keeps cleanup failure recoverable", async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementationOnce(async (operations: Promise<unknown>[]) => {
      await Promise.all(operations);
      order.push("database-committed");
    });
    mocks.deleteStorage.mockImplementationOnce(async () => {
      order.push("storage-cleanup");
      throw new Error("temporary OSS failure");
    });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }) as never, {
      params: Promise.resolve({ fileId: "file-1" })
    });

    expect(order).toEqual(["database-committed", "storage-cleanup"]);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true, cleanupPending: 1 });
    expect(mocks.softDelete).toHaveBeenCalledOnce();
  });

  it("refuses to delete a course root or any folder containing one", async () => {
    mocks.requireOwner.mockResolvedValue({ id: "ancestor" });
    mocks.findMany.mockResolvedValue([
      { id: "ancestor", parentId: null, kind: "folder", name: "教学资料", mimeType: null, path: null },
      { id: "course-root", parentId: "ancestor", kind: "folder", name: "课程云盘", mimeType: null, path: null }
    ]);
    mocks.findCourse.mockResolvedValue({ id: "course-1", title: "功能体验课" });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }) as never, {
      params: Promise.resolve({ fileId: "ancestor" })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "COURSE_DRIVE_ROOT_PROTECTED"
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteStorage).not.toHaveBeenCalled();
  });
});
