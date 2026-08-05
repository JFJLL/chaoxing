import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  findUniqueOrThrow: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    driveFile: {
      findMany: mocks.findMany,
      create: mocks.create,
      findUniqueOrThrow: mocks.findUniqueOrThrow
    }
  }
}));

import { storeDriveBatchUpload } from "@/lib/copilot/files";

const ossEnv = {
  DRIVE_STORAGE_PROVIDER: "oss",
  ALIYUN_OSS_ENDPOINT: "https://oss-cn-hangzhou.aliyuncs.com",
  ALIYUN_OSS_BUCKET: "course-drive",
  ALIYUN_OSS_ACCESS_KEY_ID: "test-key",
  ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
  ALIYUN_OSS_PREFIX: "drive"
};

function driveRecord(id: string, data: { name: string; kind: string; parentId: string | null }) {
  return {
    id,
    ownerId: "teacher-1",
    parentId: data.parentId,
    name: data.name,
    kind: data.kind,
    mimeType: data.kind === "file" ? "text/plain" : null,
    size: data.kind === "file" ? 3 : 0,
    path: data.kind === "file" ? `oss://course-drive/drive/teacher-1/object/${data.name}` : null,
    contentHash: data.kind === "file" ? "hash" : null,
    extractionStatus: data.kind === "file" ? "PENDING" : null,
    extractedText: null,
    extractionError: null,
    extractedAt: null,
    deletedAt: null
  };
}

function makeFile(name: string) {
  return new File(["abc"], name, { type: "text/plain" });
}

describe("drive batch upload", () => {
  const originalEnv = { ...process.env };
  let created: Array<{ id: string; data: { name: string; kind: string; parentId: string | null } }> = [];
  let createCall: number;

  beforeEach(() => {
    Object.assign(process.env, ossEnv);
    createCall = 0;
    created = [];
    mocks.findMany.mockResolvedValue([]);
    mocks.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) => {
      const match = created.find((item) => item.id === where.id);
      return Promise.resolve(match ? driveRecord(match.id, match.data) : driveRecord(where.id, { name: where.id, kind: "file", parentId: null }));
    });
    mocks.create.mockImplementation(({ data }: { data: { name: string; kind: string; parentId: string | null } }) => {
      createCall += 1;
      const id = `node-${createCall}`;
      created.push({ id, data });
      return Promise.resolve(driveRecord(id, data));
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uploads multiple files into the current folder without folder mode", async () => {
    const result = await storeDriveBatchUpload({
      ownerId: "teacher-1",
      parentId: "parent-1",
      items: [
        { file: makeFile("a.txt"), path: "" },
        { file: makeFile("b.txt"), path: "" }
      ]
    });

    expect(result.folder).toBeNull();
    expect(result.files).toHaveLength(2);
    expect(result.failed).toEqual([]);
    const fileCreates = created.filter((item) => item.data.kind === "file");
    expect(fileCreates.map((item) => item.data.name)).toEqual(["a.txt", "b.txt"]);
    expect(fileCreates.every((item) => item.data.parentId === "parent-1")).toBe(true);
  });

  it("creates the same-named folder and preserves sub-folder hierarchy", async () => {
    const result = await storeDriveBatchUpload({
      ownerId: "teacher-1",
      parentId: "parent-1",
      folderName: "课件",
      items: [
        { file: makeFile("1.pdf"), path: "第一章/1.pdf" },
        { file: makeFile("2.pdf"), path: "第一章/2.pdf" },
        { file: makeFile("readme.txt"), path: "" }
      ]
    });

    expect(result.failed).toEqual([]);
    expect(result.folder?.name).toBe("课件");
    const folders = created.filter((item) => item.data.kind === "folder");
    expect(folders.map((item) => item.data.name)).toEqual(["课件", "第一章"]);
    expect(folders[0]?.data.parentId).toBe("parent-1");
    expect(folders[1]?.data.parentId).toBe(folders[0]?.id);
    const files = created.filter((item) => item.data.kind === "file");
    expect(files[0]?.data.parentId).toBe(folders[1]?.id);
    expect(files[1]?.data.parentId).toBe(folders[1]?.id);
    expect(files[2]?.data.parentId).toBe(folders[0]?.id);
  });

  it("auto-renames the folder when the name is already taken", async () => {
    mocks.findMany.mockResolvedValue([{ name: "课件" }, { name: "课件 (2)" }]);

    const result = await storeDriveBatchUpload({
      ownerId: "teacher-1",
      parentId: "parent-1",
      folderName: "课件",
      items: [{ file: makeFile("a.txt"), path: "" }]
    });

    expect(result.folder?.name).toBe("课件 (3)");
    expect(created.filter((item) => item.data.kind === "folder")[0]?.data.name).toBe("课件 (3)");
  });

  it("keeps successful uploads and reports failures per file", async () => {
    mocks.create.mockImplementationOnce(({ data }: { data: { name: string; kind: string; parentId: string | null } }) => {
      createCall += 1;
      const id = `node-${createCall}`;
      created.push({ id, data });
      return Promise.resolve(driveRecord(id, data));
    });
    mocks.create.mockImplementationOnce(() => Promise.reject(new Error("OSS 上传失败")));
    mocks.create.mockImplementation(({ data }: { data: { name: string; kind: string; parentId: string | null } }) => {
      createCall += 1;
      const id = `node-${createCall}`;
      created.push({ id, data });
      return Promise.resolve(driveRecord(id, data));
    });

    const result = await storeDriveBatchUpload({
      ownerId: "teacher-1",
      parentId: "parent-1",
      items: [
        { file: makeFile("ok.txt"), path: "" },
        { file: makeFile("broken.txt"), path: "" },
        { file: makeFile("ok2.txt"), path: "" }
      ]
    });

    expect(result.files.map((file) => file.name)).toEqual(["ok.txt", "ok2.txt"]);
    expect(result.failed).toEqual([{ name: "broken.txt", error: "OSS 上传失败" }]);
  });
});
