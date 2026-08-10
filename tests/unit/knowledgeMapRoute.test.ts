import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  findFirst: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: mocks.requireCourseAccess }));
vi.mock("@/lib/db", () => ({ db: { courseKnowledgeMap: { findFirst: mocks.findFirst } } }));

import { GET } from "../../src/app/api/courses/[courseId]/knowledge-map/route";

describe("published knowledge map route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1" });
    mocks.findFirst.mockResolvedValue(null);
  });

  it("never returns deleted maps or maps whose source import is no longer visible", async () => {
    const response = await GET(new Request("http://local/api/courses/course-1/knowledge-map"), {
      params: Promise.resolve({ courseId: "course-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        courseId: "course-1",
        status: "PUBLISHED",
        sourceJobId: { not: null },
        deletedAt: null,
        sourceJob: { deletedAt: null, status: { in: ["READY_FOR_REVIEW", "APPLIED"] } }
      }
    }));
  });
});
