import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  deleteDriveFileFromStorage: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/modules/driveFiles", () => ({
  deleteDriveFileFromStorage: mocks.deleteDriveFileFromStorage,
  streamDriveFile: vi.fn()
}));

import { DELETE } from "@/app/api/drive/[fileId]/route";

type Fixture = {
  institutionId: string;
  folderId: string;
  fileId: string;
  resourceId: string;
  shareId: string;
};

let fixture: Fixture;

beforeAll(async () => {
  const institution = await db.institution.create({
    data: { name: `云盘删除集成测试 ${randomUUID()}` }
  });
  const teacher = await db.user.create({
    data: {
      name: "云盘集成测试教师",
      email: `${randomUUID()}@drive-lifecycle.test`,
      role: "TEACHER",
      institutionId: institution.id
    }
  });
  const course = await db.course.create({
    data: {
      title: "云盘集成测试课程",
      ownerId: teacher.id,
      institutionId: institution.id
    }
  });
  const folder = await db.driveFile.create({
    data: { ownerId: teacher.id, name: "待删除文件夹", kind: "folder" }
  });
  const file = await db.driveFile.create({
    data: {
      ownerId: teacher.id,
      parentId: folder.id,
      name: "课程资料.md",
      kind: "file",
      path: "oss://course-drive/drive/test/课程资料.md"
    }
  });
  const resource = await db.resource.create({
    data: {
      courseId: course.id,
      title: file.name,
      type: "file",
      driveFileId: file.id
    }
  });
  const share = await db.driveShare.create({
    data: {
      fileId: file.id,
      ownerId: teacher.id,
      code: `DRIVE-${randomUUID()}`
    }
  });

  const sessionUser: SessionUser = {
    id: teacher.id,
    name: teacher.name,
    role: "TEACHER",
    institutionId: institution.id
  };
  mocks.requireUser.mockResolvedValue(sessionUser);
  fixture = {
    institutionId: institution.id,
    folderId: folder.id,
    fileId: file.id,
    resourceId: resource.id,
    shareId: share.id
  };
});

afterAll(async () => {
  if (fixture) {
    await db.institution.deleteMany({ where: { id: fixture.institutionId } });
  }
  await db.$disconnect();
});

describe("drive delete lifecycle", () => {
  it("deletes every storage object before removing course and share references", async () => {
    const response = await DELETE(
      {} as never,
      { params: Promise.resolve({ fileId: fixture.folderId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 2 });
    expect(mocks.deleteDriveFileFromStorage).toHaveBeenCalledTimes(2);
    const storageTargets = mocks.deleteDriveFileFromStorage.mock.calls.map(([item]) => item);
    expect(storageTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.fileId, path: expect.stringMatching(/^oss:\/\//) })
      ])
    );

    const [folder, file, resourceCount, shareCount] = await Promise.all([
      db.driveFile.findUnique({ where: { id: fixture.folderId } }),
      db.driveFile.findUnique({ where: { id: fixture.fileId } }),
      db.resource.count({ where: { id: fixture.resourceId } }),
      db.driveShare.count({ where: { id: fixture.shareId } })
    ]);
    expect(folder?.deletedAt).toBeInstanceOf(Date);
    expect(file?.deletedAt).toBeInstanceOf(Date);
    expect(resourceCount).toBe(0);
    expect(shareCount).toBe(0);
  });
});
