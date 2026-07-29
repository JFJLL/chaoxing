import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  findFirst: vi.fn(),
  updateInPlace: vi.fn(),
  confirmArtifact: vi.fn(),
  createRevisionStore: vi.fn(),
  createWorkflowStore: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  isCourseManagerRecord: () => true,
  requireCourseAccess: vi.fn(),
  requireCourseManager: mocks.requireCourseManager
}));
vi.mock("@/lib/db", () => ({ db: { courseAiArtifact: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/courseWorkspace/artifactRevision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/artifactRevision")>();
  return { ...actual, updateArtifactInPlace: mocks.updateInPlace };
});
vi.mock("@/lib/courseWorkspace/artifactWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/artifactWorkflow")>();
  return { ...actual, confirmArtifact: mocks.confirmArtifact };
});
vi.mock("@/lib/courseWorkspace/prismaArtifactStores", () => ({
  createPrismaArtifactRevisionStore: mocks.createRevisionStore,
  createPrismaMutableArtifactStore: mocks.createRevisionStore,
  createPrismaArtifactWorkflowStore: mocks.createWorkflowStore
}));

import { PUT } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/route";
import { POST as CONFIRM } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/confirm/route";

const context = { params: Promise.resolve({ courseId: "course-1", artifactId: "artifact-1" }) };
const safeArtifact = {
  id: "artifact-v2", seriesId: "series-1", courseId: "course-1", userId: "teacher-1",
  appType: "lesson_plan", title: "新教案", prompt: null, payload: JSON.stringify({}), scope: null,
  status: "DRAFT", version: 2, errorCode: null, errorMessage: null, sourceJobId: null,
  sourceArtifactId: "artifact-1", startedAt: null, finishedAt: null, approvedAt: null,
  publishedAt: null, createdAt: new Date(), updatedAt: new Date()
};
const validLesson = {
  objectives: ["目标"], keyPoints: ["重点"],
  teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }], assessment: ["提问"]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
  mocks.findFirst.mockResolvedValue({ appType: "lesson_plan", payload: JSON.stringify(validLesson), lockVersion: 4, status: "DRAFT" });
  mocks.createRevisionStore.mockReturnValue({ transaction: vi.fn() });
  mocks.createWorkflowStore.mockReturnValue({ transaction: vi.fn() });
  mocks.updateInPlace.mockResolvedValue(safeArtifact);
  mocks.confirmArtifact.mockResolvedValue({ ...safeArtifact, status: "APPROVED", approvedAt: new Date() });
});

describe("PUT artifact working copy", () => {
  it("validates and normalizes the payload before updating the same artifact", async () => {
    const response = await PUT(new Request("http://localhost", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: " 新教案 ", payload: validLesson, lockVersion: 4 })
    }) as never, context);
    expect(response.status).toBe(200);
    expect(mocks.updateInPlace).toHaveBeenCalledWith(expect.anything(), {
      courseId: "course-1", artifactId: "artifact-1", expectedLockVersion: 4,
      title: "新教案", payload: JSON.stringify(validLesson)
    });
  });

  it("rejects invalid payloads, cross-course sources, and HTML manual edits", async () => {
    let response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ title: "坏数据", payload: {} }) }) as never, context);
    expect(response.status).toBe(400);
    expect(mocks.updateInPlace).not.toHaveBeenCalled();

    mocks.findFirst.mockResolvedValueOnce(null);
    response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ title: "跨课程", payload: validLesson }) }) as never, context);
    expect(response.status).toBe(404);

    mocks.findFirst.mockResolvedValueOnce({ appType: "html_courseware", payload: "{}", lockVersion: 0, status: "DRAFT" });
    response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ title: "HTML", payload: {} }) }) as never, context);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "ARTIFACT_HTML_EDIT_FORBIDDEN" });
  });
});

describe("POST artifact confirm", () => {
  it("requires a course manager and delegates an atomic confirmation", async () => {
    const response = await CONFIRM(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockVersion: 4 })
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.confirmArtifact).toHaveBeenCalledWith(expect.anything(), {
      courseId: "course-1", artifactId: "artifact-1", userId: "teacher-1", expectedLockVersion: 4
    });
    const body = await response.json();
    expect(body.artifact).toMatchObject({ status: "APPROVED" });
    expect(body.artifact).not.toHaveProperty("inputSnapshot");
  });
});
