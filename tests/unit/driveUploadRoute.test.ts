import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireTeacher: vi.fn(),
  requireDriveFileOwner: vi.fn(),
  storeDriveUpload: vi.fn(),
  storeDriveBatchUpload: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/permissions", () => ({
  requireTeacher: mocks.requireTeacher
}));

vi.mock("@/lib/modules/drivePermissions", () => ({
  requireDriveFileOwner: mocks.requireDriveFileOwner
}));

vi.mock("@/lib/copilot/files", () => ({
  MAX_DRIVE_BATCH_FILES: 200,
  storeDriveUpload: mocks.storeDriveUpload,
  storeDriveBatchUpload: mocks.storeDriveBatchUpload
}));

vi.mock("@/lib/courseWorkspace/courseResources", () => ({
  publishExistingDriveFileToCourse: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    driveFile: { create: vi.fn(), findMany: vi.fn() }
  }
}));

import { POST } from "@/app/api/drive/route";

function driveRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as NextRequest;
}

function driveRecord(id: string, name: string) {
  return { id, ownerId: "teacher-1", parentId: null, name, kind: "file", path: "oss://bucket/obj", size: 3 };
}

describe("personal drive upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.requireTeacher.mockImplementation((user: { role: string }) => {
      if (user.role !== "TEACHER" && user.role !== "ADMIN") throw new Error("需要教师权限");
    });
    mocks.storeDriveBatchUpload.mockResolvedValue({ folder: null, files: [], failed: [] });
  });

  it("rejects a batch with more than 200 files", async () => {
    const form = new FormData();
    for (let index = 0; index < 201; index += 1) {
      form.append("files", new File(["x"], `file-${index}.txt`, { type: "text/plain" }));
    }

    const response = await POST(driveRequest("http://localhost/api/drive", { method: "POST", body: form }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "一次最多上传 200 个文件" });
    expect(mocks.storeDriveBatchUpload).not.toHaveBeenCalled();
  });

  it("returns uploaded files and the created folder for a batch upload", async () => {
    const form = new FormData();
    form.set("folderName", "课件");
    form.append("files", new File(["abc"], "1.pdf", { type: "application/pdf" }));
    form.append("paths", "第一章/1.pdf");
    mocks.storeDriveBatchUpload.mockResolvedValue({
      folder: { id: "folder-1", name: "课件", kind: "folder" },
      files: [driveRecord("file-1", "1.pdf")],
      failed: []
    });

    const response = await POST(driveRequest("http://localhost/api/drive", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.folder.name).toBe("课件");
    expect(body.files).toHaveLength(1);
    expect(body.storage).toBe("oss");
    expect(mocks.storeDriveBatchUpload).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "teacher-1",
      parentId: null,
      folderName: "课件"
    }));
  });

  it("keeps the legacy single-file upload contract", async () => {
    const form = new FormData();
    form.set("file", new File(["abc"], "single.pdf", { type: "application/pdf" }));
    mocks.storeDriveUpload.mockResolvedValue(driveRecord("file-1", "single.pdf"));

    const response = await POST(driveRequest("http://localhost/api/drive", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.file.name).toBe("single.pdf");
    expect(body.storage).toBe("oss");
  });
});
