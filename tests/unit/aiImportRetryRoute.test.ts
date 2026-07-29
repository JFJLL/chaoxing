import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  findJob: vi.fn(),
  claimJob: vi.fn(),
  findClaimedJob: vi.fn(),
  updateBatch: vi.fn(),
  finalizeBatch: vi.fn(),
  enqueue: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseManager: mocks.requireCourseManager }));
vi.mock("@/lib/imports/importQueue", () => ({ enqueueImportJob: mocks.enqueue }));
vi.mock("@/lib/imports/importBatch", () => ({ finalizeImportBatch: mocks.finalizeBatch }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportJob: { findUnique: mocks.findJob },
    documentImportBatch: { updateMany: mocks.updateBatch },
    $transaction: (operation: (tx: unknown) => unknown) => operation({
      documentImportBatch: { updateMany: mocks.updateBatch },
      documentImportJob: { updateMany: mocks.claimJob, findUnique: mocks.findClaimedJob }
    })
  }
}));

import { POST } from "@/app/api/ai-import/[jobId]/retry/route";

describe("POST /api/ai-import/:jobId/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
    mocks.findJob.mockResolvedValue({
      id: "job-1", courseId: "course-1", batchId: "batch-1", batch: null, status: "FAILED", filePath: ".uploads/a.md"
    });
    mocks.updateBatch.mockResolvedValue({ count: 1 });
    mocks.claimJob.mockResolvedValue({ count: 1 });
    mocks.findClaimedJob.mockResolvedValue({ id: "job-1", status: "QUEUED" });
    mocks.finalizeBatch.mockResolvedValue(undefined);
  });

  it("atomically reopens a failed unsaved batch before queuing the document", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ jobId: "job-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.updateBatch).toHaveBeenCalledWith({
      where: { id: "batch-1", status: "FAILED", savedAt: null },
      data: { status: "PROCESSING", generatedOutline: null }
    });
    expect(mocks.claimJob).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", status: "FAILED" },
      data: expect.objectContaining({ status: "QUEUED", errorMessage: null })
    }));
    expect(mocks.enqueue).toHaveBeenCalledWith("job-1");
  });

  it("retries a failed batch combination without reprocessing successful documents", async () => {
    mocks.findJob.mockResolvedValue({
      id: "job-1", courseId: "course-1", batchId: "batch-1", status: "READY_FOR_REVIEW", filePath: ".uploads/a.md",
      batch: {
        id: "batch-1", status: "FAILED", generatedOutline: null,
        documents: [{ status: "READY_FOR_REVIEW" }, { status: "READY_FOR_REVIEW" }]
      }
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ jobId: "job-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.finalizeBatch).toHaveBeenCalledWith("batch-1");
    expect(mocks.claimJob).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("allows only one concurrent retry claim", async () => {
    mocks.claimJob.mockResolvedValue({ count: 0 });
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ jobId: "job-1" })
    });
    expect(response.status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
