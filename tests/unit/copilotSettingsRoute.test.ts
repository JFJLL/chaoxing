import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  updateCourse: vi.fn(),
  bindCourseDriveRoot: vi.fn(),
  listOwnerDriveFolders: vi.fn(),
  getCopilotAnalytics: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("@/lib/db", () => ({ db: { course: { update: mocks.updateCourse } } }));
vi.mock("@/lib/copilot/files", () => ({
  listOwnerDriveFolders: mocks.listOwnerDriveFolders
}));
vi.mock("@/lib/courseWorkspace/copilot", () => ({ getCopilotAnalytics: mocks.getCopilotAnalytics }));
vi.mock("@/lib/courseDrive/service", () => ({ bindCourseDriveRoot: mocks.bindCourseDriveRoot }));

import { PUT } from "../../src/app/api/courses/[courseId]/copilot/settings/route";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

describe("PUT /api/courses/:courseId/copilot/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.requireCourseOwner.mockResolvedValue({ id: "course-1" });
    mocks.updateCourse.mockResolvedValue({ driveRootFolderId: "root-1", copilotName: "课程小助手" });
  });

  it("persists a trimmed teacher-defined Copilot name", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotName: "  课程小助手  " })
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.updateCourse).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { copilotName: "课程小助手" }
    });
    expect(mocks.bindCourseDriveRoot).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ copilotName: "课程小助手" });
  });

  it("rebinds the unified course Drive root instead of a Copilot-only folder", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "root-2" })
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.bindCourseDriveRoot).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER" },
      "course-1",
      "root-2"
    );
    expect(mocks.updateCourse).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { copilotName: undefined }
    });
  });

  it("rejects blank names without writing", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotName: "   " })
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.updateCourse).not.toHaveBeenCalled();
  });
});
