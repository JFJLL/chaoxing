import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  storeDriveFile: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: { driveFile: { findFirst: mocks.findFirst, create: mocks.create, findUniqueOrThrow: mocks.findUniqueOrThrow } }
}));
vi.mock("@/lib/modules/driveFiles", () => ({
  storeDriveFile: mocks.storeDriveFile,
  readDriveFileBytes: vi.fn(),
  withDriveFilePath: vi.fn()
}));

import { findOrCreateDriveImportUpload, driveContentHash } from "@/lib/copilot/files";

function pdfFile(content: string) {
  return new File([Buffer.from(content)], "习近平文化思想学习纲要.pdf", { type: "application/pdf" });
}

beforeEach(() => vi.clearAllMocks());

describe("findOrCreateDriveImportUpload", () => {
  it("reuses an existing drive file with the same content hash without re-uploading", async () => {
    const content = "same-bytes";
    const hash = driveContentHash(Buffer.from(content));
    const existing = { id: "drive-1", path: "oss://redmagic/x.pdf", contentHash: hash };
    mocks.findFirst.mockResolvedValue(existing);

    const result = await findOrCreateDriveImportUpload({ ownerId: "owner-1", parentId: "folder-1", file: pdfFile(content) });

    expect(result).toEqual({ file: existing, reused: true });
    // The dedup query is scoped by owner/folder/hash and matches the content.
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({
      ownerId: "owner-1",
      parentId: "folder-1",
      contentHash: hash,
      kind: "file",
      deletedAt: null
    });
    // Crucially: no re-upload and no new record when reusing.
    expect(mocks.storeDriveFile).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
