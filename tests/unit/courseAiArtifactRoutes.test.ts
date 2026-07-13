import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  requireCourseOwner: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  recover: vi.fn(),
  recoverOne: vi.fn(),
  jobsAhead: vi.fn(),
  enqueue: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  isTeacher: (user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN",
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseOwner: mocks.requireCourseOwner
}));
vi.mock("@/lib/db", () => ({
  db: {
    courseAiArtifact: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany
    }
  }
}));
vi.mock("@/lib/courseWorkspace/aiGenerationQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/aiGenerationQueue")>();
  return {
    ...actual,
    recoverAiGenerationJobsFromDatabase: mocks.recover,
    recoverAiGenerationJobFromDatabase: mocks.recoverOne,
    getAiGenerationJobsAhead: mocks.jobsAhead,
    enqueueAiGenerationJob: mocks.enqueue
  };
});

import { GET } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/route";
import { POST as RETRY } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/retry/route";

const routeContext = {
  params: Promise.resolve({ courseId: "course-1", artifactId: "artifact-1" })
};

const snapshot = JSON.stringify({
  appType: "lesson_plan",
  context: {
    course: { kind: "course", id: "course-1", label: "课程：课程", title: "课程", description: null, truncated: false },
    scope: { kind: "course", id: "course-1", label: "全课程", truncated: false },
    outline: { kind: "outline", id: "course-outline", label: "课程结构", truncated: false, items: [] },
    imports: { kind: "import_collection", id: "course-imports", label: "课程导入原文", truncated: false, scopeExcluded: false, items: [] },
    knowledgeMap: null,
    knowledgeMapScopeExcluded: false,
    resources: { kind: "resource_collection", id: "course-resources", label: "课程资料", truncated: false, scopeExcluded: false, items: [] },
    userPrompt: null,
    truncated: false
  }
});

const artifact = {
  id: "artifact-1",
  seriesId: "series-1",
  courseId: "course-1",
  userId: "teacher-1",
  appType: "lesson_plan",
  title: "AI 教案",
  prompt: null,
  payload: null,
  inputSnapshot: snapshot,
  scope: JSON.stringify({ kind: "course" }),
  status: "FAILED",
  version: 1,
  errorCode: "MODEL_TIMEOUT",
  errorMessage: "AI 服务响应超时",
  sourceJobId: null,
  sourceArtifactId: null,
  startedAt: new Date("2026-07-13T00:00:00.000Z"),
  finishedAt: new Date("2026-07-13T00:01:00.000Z"),
  approvedAt: null,
  publishedAt: null,
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  updatedAt: new Date("2026-07-13T00:01:00.000Z")
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
  mocks.findFirst.mockResolvedValue(artifact);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.recover.mockResolvedValue(0);
  mocks.recoverOne.mockResolvedValue(false);
  mocks.jobsAhead.mockReturnValue(3);
});

describe("GET /api/courses/:courseId/ai-artifacts/:artifactId", () => {
  it("course-scopes the lookup and returns safe manager task details with jobs ahead", async () => {
    const response = await GET(new Request("http://localhost") as never, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recoverOne).toHaveBeenCalledWith("course-1", "artifact-1");
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.requireCourseAccess).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher-1" }), "course-1");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "artifact-1", courseId: "course-1" },
      select: expect.not.objectContaining({ inputSnapshot: true })
    });
    expect(body.artifact).toMatchObject({ id: "artifact-1", errorCode: "MODEL_TIMEOUT", jobsAhead: 3 });
    expect(body.artifact).not.toHaveProperty("inputSnapshot");
  });

  it("only lets students read published artifacts and hides manager error details", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });

    const response = await GET(new Request("http://localhost") as never, routeContext);
    const body = await response.json();

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "artifact-1", courseId: "course-1", status: "PUBLISHED" },
      select: expect.any(Object)
    });
    expect(body.artifact).not.toHaveProperty("errorCode");
    expect(body.artifact).not.toHaveProperty("errorMessage");
    expect(Object.keys(body.artifact).sort()).toEqual([
      "appType",
      "createdAt",
      "id",
      "payload",
      "publishedAt",
      "status",
      "title",
      "version"
    ]);
    expect(mocks.recover).not.toHaveBeenCalled();
  });

  it("returns 404 for an artifact outside the course", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost") as never, routeContext);

    expect(response.status).toBe(404);
  });
});

describe("POST /api/courses/:courseId/ai-artifacts/:artifactId/retry", () => {
  it("requeues the same failed artifact without changing its exact snapshot", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({ id: artifact.id, appType: artifact.appType, status: artifact.status, inputSnapshot: snapshot })
      .mockResolvedValueOnce({ ...artifact, status: "QUEUED", errorCode: null, errorMessage: null, startedAt: null, finishedAt: null });

    const response = await RETRY(new Request("http://localhost", { method: "POST" }) as never, routeContext);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.requireCourseOwner).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher-1" }), "course-1");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "artifact-1", courseId: "course-1", status: "FAILED" },
      data: {
        status: "QUEUED",
        payload: null,
        runToken: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null
      }
    });
    expect(mocks.enqueue).toHaveBeenCalledWith("artifact-1");
    expect(body.artifact).toMatchObject({ id: "artifact-1", status: "QUEUED" });
    expect(body.artifact).not.toHaveProperty("inputSnapshot");
  });

  it.each(["QUEUED", "GENERATING", "DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"])(
    "returns 409 instead of retrying %s",
    async (status) => {
      mocks.findFirst.mockResolvedValue({ id: artifact.id, appType: artifact.appType, status, inputSnapshot: snapshot });

      const response = await RETRY(new Request("http://localhost", { method: "POST" }) as never, routeContext);

      expect(response.status).toBe(409);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  );

  it("returns 409 if another request wins the failed-to-queued transition", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: artifact.id, appType: artifact.appType, status: "FAILED", inputSnapshot: snapshot });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await RETRY(new Request("http://localhost", { method: "POST" }) as never, routeContext);

    expect(response.status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a corrupted snapshot without requeueing", async () => {
    mocks.findFirst.mockResolvedValue({ id: artifact.id, appType: artifact.appType, status: "FAILED", inputSnapshot: "not-json" });

    const response = await RETRY(new Request("http://localhost", { method: "POST" }) as never, routeContext);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_GENERATION_INPUT_INVALID" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
