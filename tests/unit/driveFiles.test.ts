import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDriveFileFromStorage, readDriveFileBytes, storeDriveFile } from "@/lib/modules/driveFiles";

const ossEnv = {
  DRIVE_STORAGE_PROVIDER: "oss",
  ALIYUN_OSS_ENDPOINT: "https://oss-cn-hangzhou.aliyuncs.com",
  ALIYUN_OSS_BUCKET: "course-drive",
  ALIYUN_OSS_ACCESS_KEY_ID: "test-key",
  ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
  ALIYUN_OSS_PREFIX: "drive"
};

describe("drive file storage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ossEnv);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("keeps the readable original file name at the end of the OSS object key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const path = await storeDriveFile({
      ownerId: "teacher-1",
      fileName: "课程资料.pdf",
      bytes: Buffer.from("pdf"),
      mimeType: "application/pdf"
    });

    expect(path).toMatch(/^oss:\/\/course-drive\/drive\/teacher-1\/[^/]+\/课程资料\.pdf$/);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(decodeURIComponent(url.toString())).toContain("/drive/teacher-1/");
    expect(decodeURIComponent(url.pathname)).toMatch(/\/课程资料\.pdf$/);
    expect(init.method).toBe("PUT");
  });

  it("deletes an OSS object before the drive record is removed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteDriveFileFromStorage({
      kind: "file",
      name: "课程资料.pdf",
      mimeType: "application/pdf",
      path: "oss://course-drive/drive/teacher-1/object/课程资料.pdf"
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(decodeURIComponent(url.pathname)).toContain("/object/课程资料.pdf");
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("authorization")).toMatch(/^OSS test-key:/);
  });

  it("signs OSS downloads without an unsent content-type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("file bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readDriveFileBytes({
      kind: "file",
      name: "课程资料.pdf",
      mimeType: "application/pdf",
      path: "oss://course-drive/drive/teacher-1/object/课程资料.pdf"
    })).resolves.toEqual(Buffer.from("file bytes"));

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).has("content-type")).toBe(false);
    expect(init.method).toBeUndefined();
  });
});
