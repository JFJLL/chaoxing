import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  requireCourseManager: vi.fn(),
  findSession: vi.fn(),
  findSessions: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseManager: mocks.requireCourseManager
}));
vi.mock("@/lib/db", () => ({
  db: { attendanceSession: { findFirst: mocks.findSession, findMany: mocks.findSessions } }
}));

import { GET as GET_TOKEN } from "../../src/app/api/courses/[courseId]/attendance/[sessionId]/token/route";
import { GET as GET_ATTENDANCE } from "../../src/app/api/courses/[courseId]/attendance/route";

const context = {
  params: Promise.resolve({ courseId: "course-1", sessionId: "session-1" })
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    mocks.requireCourseManager.mockRejectedValue(new Error("无权管理课程"));
});

describe("GET attendance token", () => {
  it("returns a structured 403 when course management permission is lost", async () => {
    const response = await GET_TOKEN(new Request("http://localhost"), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "无权管理课程" });
    expect(mocks.findSession).not.toHaveBeenCalled();
  });

  it("returns a structured 403 when attendance access is lost", async () => {
    mocks.requireCourseAccess.mockRejectedValue(new Error("无权访问课程"));

    const response = await GET_ATTENDANCE(new Request("http://localhost") as never, {
      params: Promise.resolve({ courseId: "course-1" })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "无权访问课程" });
    expect(mocks.findSessions).not.toHaveBeenCalled();
  });
});
