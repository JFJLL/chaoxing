import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  deleteMaps: vi.fn(),
  deleteArtifacts: vi.fn(),
  deleteJob: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/imports/importQueue", () => ({
  getImportQueueSnapshot: () => ({ activeWorkers: 0, pendingJobs: [] }),
  recoverImportJobsFromDatabase: vi.fn()
}));
vi.mock("@/lib/imports/importProgress", () => ({ getJobsAhead: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportJob: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction
  }
}));

import { DELETE } from "../../src/app/api/ai-import/[jobId]/route";

const context = { params: Promise.resolve({ jobId: "job-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1" });
  mocks.findUnique.mockResolvedValue({ id: "job-1", courseId: "course-1" });
  mocks.transaction.mockImplementation(async (operation) => operation({
    courseKnowledgeMap: { deleteMany: mocks.deleteMaps },
    courseAiArtifact: { deleteMany: mocks.deleteArtifacts },
    documentImportJob: { delete: mocks.deleteJob }
  }));
});

describe("DELETE /api/ai-import/:jobId", () => {
  it("removes every derived knowledge map and invalidates course route data", async () => {
    const response = await DELETE(new Request("http://localhost/api/ai-import/job-1", { method: "DELETE" }) as never, context);

    expect(response.status).toBe(200);
    expect(mocks.deleteMaps).toHaveBeenCalledWith({ where: { sourceJobId: "job-1" } });
    expect(mocks.deleteArtifacts).toHaveBeenCalledWith({
      where: { sourceJobId: "job-1", status: { not: "PUBLISHED" } }
    });
    expect(mocks.deleteJob).toHaveBeenCalledWith({ where: { id: "job-1" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/space/courses/course-1", "layout");
  });
});
