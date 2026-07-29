import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  requireCourseOwner: vi.fn(),
  updateCourseDriveSettings: vi.fn(),
  listCourseDriveRootCandidates: vi.fn(),
  getCopilotAnalytics: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  requireCourseManager: mocks.requireCourseManager,
  requireCourseOwner: mocks.requireCourseOwner
}));
vi.mock("@/lib/courseWorkspace/copilot", () => ({ getCopilotAnalytics: mocks.getCopilotAnalytics }));
vi.mock("@/lib/courseDrive/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/courseDrive/service")>()),
  listCourseDriveRootCandidates: mocks.listCourseDriveRootCandidates,
  updateCourseDriveSettings: mocks.updateCourseDriveSettings
}));

import { GET, PUT } from "../../src/app/api/courses/[courseId]/copilot/settings/route";

const context = { params: Promise.resolve({ courseId: "course-1" }) };

describe("PUT /api/courses/:courseId/copilot/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER", institutionId: "institution-1" });
    mocks.requireCourseManager.mockResolvedValue({
      id: "course-1",
      ownerId: "teacher-1",
      driveRootFolderId: "root-1",
      copilotName: "课程小助手"
    });
    mocks.requireCourseOwner.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    mocks.updateCourseDriveSettings.mockResolvedValue({ driveRootFolderId: "root-1", copilotName: "课程小助手" });
    mocks.listCourseDriveRootCandidates.mockResolvedValue([{ id: "root-2", name: "备选", path: "备选" }]);
    mocks.getCopilotAnalytics.mockResolvedValue({ calls: 1, activeUsers: 1, success: 1, failed: 0, skills: [] });
  });

  it("persists a trimmed teacher-defined Copilot name", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotName: "  课程小助手  " })
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.updateCourseDriveSettings).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER", institutionId: "institution-1" },
      "course-1",
      { copilotName: "课程小助手" }
    );
    expect(mocks.requireCourseOwner).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ copilotName: "课程小助手" });
  });

  it("rebinds the unified course Drive root instead of a Copilot-only folder", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "root-2" })
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireCourseOwner).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER", institutionId: "institution-1" },
      "course-1",
    );
    expect(mocks.updateCourseDriveSettings).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER", institutionId: "institution-1" },
      "course-1",
      { folderId: "root-2" }
    );
  });

  it("rejects blank names without writing", async () => {
    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotName: "   " })
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.updateCourseDriveSettings).not.toHaveBeenCalled();
  });

  it("fails the entire request when a collaborator includes folderId", async () => {
    mocks.requireCourseManager.mockResolvedValue({
      id: "course-1",
      ownerId: "owner-1",
      driveRootFolderId: "root-1",
      copilotName: "旧名称"
    });
    mocks.requireCourseOwner.mockRejectedValue(new Error("无权管理课程"));

    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: "root-2", copilotName: "不应保存" })
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.updateCourseDriveSettings).not.toHaveBeenCalled();
  });

  it("requires owner permission even when folderId is null", async () => {
    mocks.requireCourseManager.mockResolvedValue({ id: "course-1", ownerId: "owner-1" });
    mocks.requireCourseOwner.mockRejectedValue(new Error("无权管理课程"));

    const response = await PUT(new Request("http://localhost/api/courses/course-1/copilot/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: null, copilotName: "不应保存" })
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.updateCourseDriveSettings).not.toHaveBeenCalled();
  });

  it("does not return owner drive folders to collaborators", async () => {
    mocks.requireCourseManager.mockResolvedValue({
      id: "course-1",
      ownerId: "owner-1",
      driveRootFolderId: "root-1",
      copilotName: "课程小助手"
    });

    const response = await GET(new Request("http://localhost/api/courses/course-1/copilot/settings"), context);

    expect(response.status).toBe(200);
    expect(mocks.listCourseDriveRootCandidates).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      folderId: "root-1",
      copilotName: "课程小助手",
      folders: [],
      canBindRoot: false,
      analytics: { calls: 1 }
    });
  });

  it("returns bindable owner folders to the owner", async () => {
    const response = await GET(new Request("http://localhost/api/courses/course-1/copilot/settings"), context);

    expect(response.status).toBe(200);
    expect(mocks.listCourseDriveRootCandidates).toHaveBeenCalledWith(
      { id: "teacher-1", role: "TEACHER", institutionId: "institution-1" },
      "course-1"
    );
    await expect(response.json()).resolves.toMatchObject({ folders: [{ id: "root-2" }], canBindRoot: true });
  });
});
