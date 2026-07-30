import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  findBatch: vi.fn(),
  updateManyJobs: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseManager: mocks.requireCourseManager }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  db: {
    documentImportBatch: { findFirst: mocks.findBatch },
    documentImportJob: { updateMany: mocks.updateManyJobs }
  }
}));

import { DELETE } from "../../src/app/api/courses/[courseId]/ai-import/batches/[batchId]/route";

const context = { params: Promise.resolve({ courseId: "course-1", batchId: "batch-1" }) };

function request() {
  return new Request("http://localhost/api/courses/course-1/ai-import/batches/batch-1", { method: "DELETE" }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
  mocks.findBatch.mockResolvedValue({ id: "batch-1" });
  mocks.updateManyJobs.mockResolvedValue({ count: 2 });
});

describe("DELETE /api/courses/:courseId/ai-import/batches/:batchId", () => {
  it("soft-deletes every job in the batch in one call for a manager", async () => {
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.updateManyJobs).toHaveBeenCalledWith({
      where: { batchId: "batch-1", deletedAt: null },
      data: { status: "DELETED", deletedAt: expect.any(Date) }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/space/courses/course-1", "layout");
  });

  it("returns 404 for a batch that does not belong to the course", async () => {
    mocks.findBatch.mockResolvedValue(null);
    const response = await DELETE(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.updateManyJobs).not.toHaveBeenCalled();
  });

  it("rejects a non-manager with 403 and never soft-deletes", async () => {
    mocks.requireCourseManager.mockRejectedValue(new Error("无权管理课程"));
    const response = await DELETE(request(), context);
    expect(response.status).toBe(403);
    expect(mocks.updateManyJobs).not.toHaveBeenCalled();
  });
});
