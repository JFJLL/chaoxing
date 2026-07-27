import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  deleteMaps: vi.fn(),
  deleteArtifacts: vi.fn(),
  deleteJob: vi.fn(),
  revalidatePath: vi.fn(),
  recoverJob: vi.fn(),
  getJobsAhead: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/imports/importQueue", () => ({
  getImportQueueSnapshot: () => ({ activeWorkers: 0, pendingJobs: [] }),
  recoverImportJobFromDatabase: mocks.recoverJob
}));
vi.mock("@/lib/imports/importProgress", () => ({ getJobsAhead: mocks.getJobsAhead }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportJob: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction
  }
}));

import { DELETE, GET } from "../../src/app/api/ai-import/[jobId]/route";

const context = { params: Promise.resolve({ jobId: "job-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1" });
  mocks.recoverJob.mockResolvedValue(false);
  mocks.getJobsAhead.mockReturnValue(null);
  mocks.findUnique.mockResolvedValue({ id: "job-1", courseId: "course-1" });
  mocks.transaction.mockImplementation(async (operation) => operation({
    courseKnowledgeMap: { deleteMany: mocks.deleteMaps },
    courseAiArtifact: { deleteMany: mocks.deleteArtifacts },
    documentImportJob: { delete: mocks.deleteJob }
  }));
});

describe("GET /api/ai-import/:jobId", () => {
  it("returns a bounded polling payload and marks review content ready", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: "job-1", courseId: "course-1" })
      .mockResolvedValueOnce({
        id: "job-1",
        status: "READY_FOR_REVIEW",
        currentStage: "等待教师确认",
        errorMessage: null,
        generatedOutline: "{\"chapters\":[]}",
        knowledgeMaps: [{ id: "map-1" }],
        extractedText: "不应返回的大段文档内容"
      });

    const response = await GET(new Request("http://localhost/api/ai-import/job-1") as never, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      job: {
        id: "job-1",
        status: "READY_FOR_REVIEW",
        currentStage: "等待教师确认",
        errorMessage: null,
        reviewReady: true,
        jobsAhead: null
      }
    });
    expect(mocks.recoverJob).toHaveBeenCalledWith("job-1", "course-1");
    expect(JSON.stringify(body)).not.toContain("不应返回的大段文档内容");
  });
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
