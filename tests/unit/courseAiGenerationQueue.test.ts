import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canRetryAiGeneration,
  isSupportedQueuedAppType,
  parseAiGenerationInputSnapshot,
  toSafeAiArtifactDto
} from "@/lib/courseWorkspace/aiGenerationQueue";

const mocks = vi.hoisted(() => ({
  runJob: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  generate: vi.fn()
}));

vi.mock("@/lib/courseWorkspace/runAiGenerationJob", () => ({
  runAiGenerationJob: mocks.runJob
}));

vi.mock("@/lib/db", () => ({
  db: {
    courseAiArtifact: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany
    }
  }
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadQueue() {
  vi.resetModules();
  return import("@/lib/courseWorkspace/aiGenerationQueue");
}

const context = {
  course: { kind: "course", id: "course-1", label: "课程：测试", title: "测试", description: null, truncated: false },
  scope: { kind: "course", id: "course-1", label: "全课程", truncated: false },
  outline: { kind: "outline", id: "course-outline", label: "课程结构", truncated: false, items: [] },
  imports: { kind: "import_collection", id: "course-imports", label: "课程导入原文", truncated: false, scopeExcluded: false, items: [] },
  knowledgeMap: null,
  knowledgeMapScopeExcluded: false,
  resources: { kind: "resource_collection", id: "course-resources", label: "课程资料", truncated: false, scopeExcluded: false, items: [] },
  userPrompt: null,
  truncated: false
};

describe("AI generation snapshot and safe DTO", () => {
  it("parses the exact server generation input and rejects app-type mismatch", () => {
    const raw = JSON.stringify({ appType: "lesson_plan", context });

    expect(parseAiGenerationInputSnapshot(raw, "lesson_plan")).toMatchObject({
      appType: "lesson_plan",
      context
    });
    expect(() => parseAiGenerationInputSnapshot(raw, "courseware")).toThrow("AI_GENERATION_INPUT_INVALID");
  });

  it.each([
    null,
    "not-json",
    JSON.stringify({ appType: "question_generation" }),
    JSON.stringify({ appType: "question_generation", context: [] }),
    JSON.stringify({ appType: "unknown", context: {} })
  ])("rejects malformed or incomplete snapshots: %j", (raw) => {
    expect(() => parseAiGenerationInputSnapshot(raw, "question_generation")).toThrow("AI_GENERATION_INPUT_INVALID");
  });

  it("rejects incomplete contexts and extra snapshot fields", () => {
    expect(() => parseAiGenerationInputSnapshot(
      JSON.stringify({ appType: "question_generation", context: { course: context.course } }),
      "question_generation"
    )).toThrow("AI_GENERATION_INPUT_INVALID");
    expect(() => parseAiGenerationInputSnapshot(
      JSON.stringify({ appType: "question_generation", context, extra: true }),
      "question_generation"
    )).toThrow("AI_GENERATION_INPUT_INVALID");
  });

  it("strictly parses paper and HTML lineage snapshots", () => {
    const approvedQuestions = [
      { id: "q-1", type: "single_choice", stem: "题目一" },
      { id: "q-2", type: "multiple_choice", stem: "题目二" },
      { id: "q-3", type: "short_answer", stem: "题目三" }
    ];
    expect(parseAiGenerationInputSnapshot(JSON.stringify({
      appType: "paper_assembly",
      context,
      approvedQuestions
    }), "paper_assembly")).toMatchObject({ approvedQuestions });
    expect(() => parseAiGenerationInputSnapshot(JSON.stringify({
      appType: "paper_assembly",
      context,
      approvedQuestions: [{ id: "q-1" }]
    }), "paper_assembly")).toThrow("AI_GENERATION_INPUT_INVALID");

    const sourceCourseware = { slides: [{ title: "标题", bullets: ["要点"], speakerNotes: "备注" }] };
    expect(parseAiGenerationInputSnapshot(JSON.stringify({
      appType: "html_courseware",
      sourceCourseware,
      prompt: "课堂展示"
    }), "html_courseware")).toEqual({ appType: "html_courseware", sourceCourseware, prompt: "课堂展示" });
    expect(() => parseAiGenerationInputSnapshot(JSON.stringify({
      appType: "html_courseware",
      sourceCourseware,
      clientContent: "forged"
    }), "html_courseware")).toThrow("AI_GENERATION_INPUT_INVALID");
  });

  it("allows every enabled generation app through the shared queue", () => {
    for (const appType of ["question_generation", "lesson_plan", "courseware", "paper_assembly", "html_courseware"] as const) {
      expect(isSupportedQueuedAppType(appType)).toBe(true);
    }
  });

  it("never exposes inputSnapshot and only exposes safe errors to managers", () => {
    const record = {
      id: "artifact-1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "lesson_plan",
      title: "教案",
      prompt: "补充要求",
      payload: null,
      inputSnapshot: '{"secret":"server-context"}',
      scope: '{"kind":"course"}',
      status: "FAILED",
      version: 1,
      errorCode: "MODEL_REQUEST_FAILED",
      errorMessage: "AI 服务调用失败",
      sourceJobId: null,
      sourceArtifactId: null,
      startedAt: null,
      finishedAt: new Date("2026-07-13T00:00:00.000Z"),
      approvedAt: null,
      publishedAt: null,
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
      updatedAt: new Date("2026-07-13T00:00:00.000Z")
    };

    const managerDto = toSafeAiArtifactDto(record, { canManage: true, jobsAhead: 2 });
    const studentDto = toSafeAiArtifactDto(record, { canManage: false, jobsAhead: null });

    expect(managerDto).not.toHaveProperty("inputSnapshot");
    expect(managerDto).toMatchObject({ errorCode: "MODEL_REQUEST_FAILED", errorMessage: "AI 服务调用失败", jobsAhead: 2 });
    expect(studentDto).not.toHaveProperty("inputSnapshot");
    expect(studentDto).not.toHaveProperty("errorCode");
    expect(studentDto).not.toHaveProperty("errorMessage");
    expect(Object.keys(studentDto).sort()).toEqual([
      "appType",
      "createdAt",
      "id",
      "payload",
      "publishedAt",
      "status",
      "title",
      "version"
    ]);
  });

  it("only permits failed artifacts to retry", () => {
    expect(canRetryAiGeneration("FAILED")).toBe(true);
    for (const status of ["QUEUED", "GENERATING", "DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"]) {
      expect(canRetryAiGeneration(status)).toBe(false);
    }
  });
});

describe("in-process AI generation queue", () => {
  beforeEach(() => {
    mocks.runJob.mockReset();
    mocks.findMany.mockReset();
    mocks.updateMany.mockReset();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    process.env.MAX_AI_GENERATION_WORKERS = "1";
    process.env.AI_GENERATION_QUEUE_PROVIDER = "in-process";
    delete process.env.MAX_AI_GENERATION_PENDING_JOBS;
    delete process.env.AI_GENERATION_RECOVERY_BATCH_SIZE;
  });

  it("protects duplicate enqueue and reserves the worker until the promise settles", async () => {
    const first = deferred();
    mocks.runJob.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const queue = await loadQueue();

    queue.enqueueAiGenerationJob("artifact-1");
    queue.enqueueAiGenerationJob("artifact-1");
    expect(mocks.runJob).toHaveBeenCalledTimes(1);
    expect(queue.getAiGenerationQueueSnapshot()).toMatchObject({ activeWorkers: 1, pendingJobs: [] });

    first.resolve();
    await vi.waitFor(() => expect(queue.getAiGenerationQueueSnapshot().activeWorkers).toBe(0));
    queue.enqueueAiGenerationJob("artifact-1");
    await vi.waitFor(() => expect(mocks.runJob).toHaveBeenCalledTimes(2));
  });

  it("enforces the worker bound and reports jobs ahead from active plus pending work", async () => {
    const first = deferred();
    mocks.runJob.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const queue = await loadQueue();

    queue.enqueueAiGenerationJob("artifact-1");
    queue.enqueueAiGenerationJob("artifact-2");
    queue.enqueueAiGenerationJob("artifact-3");

    expect(mocks.runJob).toHaveBeenCalledTimes(1);
    expect(queue.getAiGenerationJobsAhead("artifact-2")).toBe(1);
    expect(queue.getAiGenerationJobsAhead("artifact-3")).toBe(2);
    expect(queue.getAiGenerationJobsAhead("artifact-1")).toBe(0);
    first.resolve();
    await vi.waitFor(() => expect(mocks.runJob).toHaveBeenCalledTimes(3));
  });

  it("does not recover a queued or stale record already reserved locally", async () => {
    const running = deferred();
    mocks.runJob.mockReturnValueOnce(running.promise).mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValueOnce([{ id: "artifact-1", status: "GENERATING", runToken: "lease-1" }]);
    const queue = await loadQueue();

    queue.enqueueAiGenerationJob("artifact-1");
    await queue.recoverAiGenerationJobFromDatabase("course-1", "artifact-1");

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.runJob).toHaveBeenCalledTimes(1);
    running.resolve();
    await vi.waitFor(() => expect(queue.getAiGenerationQueueSnapshot().activeWorkers).toBe(0));
  });

  it("resets and enqueues a genuinely stale generating record", async () => {
    mocks.runJob.mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValueOnce([{ id: "artifact-stale", status: "GENERATING", runToken: "old-lease" }]);
    const queue = await loadQueue();

    await queue.recoverAiGenerationJobFromDatabase("course-1", "artifact-stale");

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "artifact-stale", status: "GENERATING", runToken: "old-lease" },
      data: expect.objectContaining({ status: "QUEUED", runToken: null, startedAt: null, finishedAt: null })
    }));
    await vi.waitFor(() => expect(mocks.runJob).toHaveBeenCalledWith("artifact-stale"));
  });

  it("does not enqueue a stale row when a newer lease wins before recovery resets it", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "artifact-stale", status: "GENERATING", runToken: "old-lease" }]);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    const queue = await loadQueue();

    await queue.recoverAiGenerationJobFromDatabase("course-1", "artifact-stale");

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "artifact-stale", status: "GENERATING", runToken: "old-lease" }
    }));
    expect(mocks.runJob).not.toHaveBeenCalled();
  });

  it("recovers in bounded pages and round-robins mixed courses", async () => {
    process.env.AI_GENERATION_RECOVERY_BATCH_SIZE = "4";
    process.env.MAX_AI_GENERATION_PENDING_JOBS = "10";
    const running = deferred();
    mocks.runJob.mockReturnValueOnce(running.promise).mockResolvedValue(undefined);
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "a-1", courseId: "course-a", status: "QUEUED", runToken: null },
        { id: "a-2", courseId: "course-a", status: "QUEUED", runToken: null },
        { id: "b-1", courseId: "course-b", status: "QUEUED", runToken: null },
        { id: "b-2", courseId: "course-b", status: "QUEUED", runToken: null }
      ])
      .mockResolvedValueOnce([]);
    const queue = await loadQueue();

    await queue.recoverAiGenerationJobsFromDatabase();

    expect(mocks.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: 4,
      orderBy: { id: "asc" },
      select: { id: true, courseId: true, status: true, runToken: true }
    }));
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: "b-2" },
      skip: 1,
      take: 4
    }));
    expect(mocks.runJob).toHaveBeenCalledWith("a-1");
    expect(queue.getAiGenerationQueueSnapshot().pendingJobs).toEqual(["b-1", "a-2", "b-2"]);
    running.resolve();
    await vi.waitFor(() => expect(queue.getAiGenerationQueueSnapshot().activeWorkers).toBe(0));
  });

  it("scans the full global backlog window before filling a small pending queue", async () => {
    process.env.AI_GENERATION_RECOVERY_BATCH_SIZE = "50";
    process.env.MAX_AI_GENERATION_PENDING_JOBS = "10";
    const running = deferred();
    mocks.runJob.mockReturnValueOnce(running.promise).mockResolvedValue(undefined);
    mocks.findMany
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => ({
        id: `a-${String(index + 1).padStart(3, "0")}`,
        courseId: "course-a",
        status: "QUEUED",
        runToken: null
      })))
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => ({
        id: `a-${String(index + 51).padStart(3, "0")}`,
        courseId: "course-a",
        status: "QUEUED",
        runToken: null
      })))
      .mockResolvedValueOnce([
        { id: "b-001", courseId: "course-b", status: "QUEUED", runToken: null }
      ]);
    const queue = await loadQueue();

    await queue.recoverAiGenerationJobsFromDatabase();

    expect(mocks.findMany).toHaveBeenCalledTimes(3);
    expect(mocks.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      cursor: { id: "a-100" },
      skip: 1,
      take: 50
    }));
    expect(queue.getAiGenerationQueueSnapshot().pendingJobs).toContain("b-001");
    running.resolve();
    await vi.waitFor(() => expect(queue.getAiGenerationQueueSnapshot().activeWorkers).toBe(0));
  });

  it("never grows the in-memory pending queue beyond its configured cap during recovery", async () => {
    process.env.AI_GENERATION_RECOVERY_BATCH_SIZE = "5";
    process.env.MAX_AI_GENERATION_PENDING_JOBS = "2";
    const running = deferred();
    mocks.runJob.mockReturnValueOnce(running.promise).mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValueOnce(Array.from({ length: 5 }, (_, index) => ({
      id: `artifact-${index + 1}`,
      courseId: `course-${index % 2}`,
      status: "QUEUED",
      runToken: null
    })));
    const queue = await loadQueue();

    await queue.recoverAiGenerationJobsFromDatabase();

    expect(queue.getAiGenerationQueueSnapshot().pendingJobs).toHaveLength(2);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    running.resolve();
    await vi.waitFor(() => expect(queue.getAiGenerationQueueSnapshot().activeWorkers).toBe(0));
  });

  it("rejects queue providers not implemented by this build", async () => {
    process.env.AI_GENERATION_QUEUE_PROVIDER = "redis";
    const queue = await loadQueue();

    expect(() => queue.enqueueAiGenerationJob("artifact-1")).toThrow("not supported");
    await expect(queue.recoverAiGenerationJobsFromDatabase()).rejects.toThrow("not supported");
  });
});
