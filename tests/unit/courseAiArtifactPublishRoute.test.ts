import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  publishArtifact: vi.fn(),
  createStore: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("@/lib/courseWorkspace/prismaArtifactStores", () => ({
  createPrismaArtifactWorkflowStore: mocks.createStore
}));
vi.mock("@/lib/courseWorkspace/artifactWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/artifactWorkflow")>();
  return { ...actual, publishArtifact: mocks.publishArtifact };
});

import { ArtifactWorkflowError } from "@/lib/courseWorkspace/artifactWorkflow";
import { POST } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/publish/route";

const context = { params: Promise.resolve({ courseId: "course-1", artifactId: "artifact-1" }) };
const artifact = {
  id: "artifact-1", seriesId: "series-1", courseId: "course-1", userId: "teacher-1",
  appType: "paper_assembly", title: "试卷", prompt: null, payload: "{}", scope: null,
  status: "PUBLISHED", version: 2, errorCode: null, errorMessage: null, sourceJobId: null,
  sourceArtifactId: null, startedAt: null, finishedAt: null, approvedAt: new Date(),
  publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date()
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1" });
  mocks.createStore.mockReturnValue({ transaction: vi.fn() });
  mocks.publishArtifact.mockResolvedValue(artifact);
});

describe("POST artifact publish", () => {
  const publishRequest = () => new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockVersion: 6 })
  });

  it("requires ownership, delegates the course-scoped transition, and returns a manager-safe DTO", async () => {
    const response = await POST(publishRequest(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireCourseOwner).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher-1" }), "course-1");
    expect(mocks.publishArtifact).toHaveBeenCalledWith(expect.any(Object), {
      courseId: "course-1", artifactId: "artifact-1", expectedLockVersion: 6
    });
    expect(body.artifact).toMatchObject({ id: "artifact-1", status: "PUBLISHED" });
    expect(body.artifact).not.toHaveProperty("inputSnapshot");
    expect(body.artifact).not.toHaveProperty("runToken");
  });

  it.each([
    ["AI_ARTIFACT_TYPE_NOT_PUBLISHABLE", false],
    ["ARTIFACT_PUBLISH_CONFLICT", true]
  ] as const)("maps %s to a stable 409 response", async (code, retryable) => {
    mocks.publishArtifact.mockRejectedValue(new ArtifactWorkflowError(code, retryable));
    const response = await POST(publishRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code, retryable });
  });

  it("does not call the workflow when ownership fails", async () => {
    mocks.requireCourseOwner.mockRejectedValue(new Error("无权管理课程"));
    const response = await POST(publishRequest(), context);
    expect(response.status).toBe(403);
    expect(mocks.publishArtifact).not.toHaveBeenCalled();
  });

  it("rejects requests that omit the optimistic-lock version", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    expect(response.status).toBe(400);
    expect(mocks.publishArtifact).not.toHaveBeenCalled();
  });
});
