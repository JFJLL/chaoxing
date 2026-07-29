import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseManager: vi.fn(),
  requireCourseAccess: vi.fn(),
  isCourseManagerRecord: vi.fn(),
  findCourse: vi.fn(),
  countArtifacts: vi.fn(),
  createArtifact: vi.fn(),
  findArtifacts: vi.fn(),
  findSourceArtifact: vi.fn(),
  findApprovedQuestions: vi.fn(),
  findImportDocuments: vi.fn(),
  buildContext: vi.fn(),
  generate: vi.fn(),
  generateHtml: vi.fn(),
  enqueue: vi.fn(),
  recover: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  isCourseManagerRecord: mocks.isCourseManagerRecord,
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseManager: mocks.requireCourseManager
}));
vi.mock("@/lib/db", () => ({
  db: {
    course: { findUnique: mocks.findCourse },
    courseAiArtifact: {
      count: mocks.countArtifacts,
      create: mocks.createArtifact,
      findMany: mocks.findArtifacts,
      findFirst: mocks.findSourceArtifact
    },
    courseQuestion: { findMany: mocks.findApprovedQuestions },
    documentImportJob: { findMany: mocks.findImportDocuments }
  }
}));
vi.mock("@/lib/courseWorkspace/generateAiArtifact", () => ({
  generateCourseAiArtifact: mocks.generate,
  generateHtmlCoursewareWithAi: mocks.generateHtml
}));
vi.mock("@/lib/courseWorkspace/aiGenerationQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/aiGenerationQueue")>();
  return {
    ...actual,
    enqueueAiGenerationJob: mocks.enqueue,
    recoverAiGenerationJobsFromDatabase: mocks.recover,
    getAiGenerationJobsAhead: vi.fn().mockReturnValue(0)
  };
});
vi.mock("@/lib/courseWorkspace/buildAiContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/buildAiContext")>();
  return { ...actual, buildCourseAiContext: mocks.buildContext };
});

import { GET, POST } from "../../src/app/api/courses/[courseId]/ai-apps/route";
import { InvalidAiScopeError } from "../../src/lib/courseWorkspace/buildAiContext";
import { AiContextTooLargeError } from "../../src/lib/courseWorkspace/buildAiContext";
import { resetAiGenerationRequestGuard } from "../../src/lib/ai/generationRequestGuard";

function request(appType: string, body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/courses/course-1/ai-apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appType,
      ...(appType === "lesson_plan" && !("sourceSelections" in body)
        ? { sourceSelections: [{ documentId: "document-1", sectionIds: [] }] }
        : {}),
      ...body
    })
  });
}

const context = { params: Promise.resolve({ courseId: "course-1" }) };
const validContext = {
  course: { kind: "course", id: "course-1", label: "课程：课程", title: "课程", description: null, truncated: false },
  scope: { kind: "course", id: "course-1", label: "全课程", truncated: false },
  outline: { kind: "outline", id: "course-outline", label: "课程结构", truncated: false, items: [] },
  imports: { kind: "import_collection", id: "course-imports", label: "课程导入原文", truncated: false, scopeExcluded: false, items: [] },
  knowledgeMap: null,
  knowledgeMapScopeExcluded: false,
  resources: { kind: "resource_collection", id: "course-resources", label: "课程资料", truncated: false, scopeExcluded: false, items: [] },
  userPrompt: null,
  truncated: false
};

beforeEach(() => {
  resetAiGenerationRequestGuard();
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseManager.mockResolvedValue({ id: "course-1" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
  mocks.isCourseManagerRecord.mockImplementation((user: { id: string; role: string }, course: { ownerId: string }) => user.role === "ADMIN" || course.ownerId === user.id);
  mocks.findCourse.mockResolvedValue({ id: "course-1", title: "课程", outlineVersion: 0, chapters: [] });
  mocks.countArtifacts.mockResolvedValue(0);
  mocks.buildContext.mockResolvedValue({ course: { id: "course-1", title: "课程" }, scope: { kind: "course", id: "course-1", label: "全课程" } });
  mocks.createArtifact.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "artifact-1",
    seriesId: "series-1",
    courseId: "course-1",
    userId: "teacher-1",
    prompt: null,
    payload: null,
    scope: null,
    version: 1,
    errorCode: null,
    errorMessage: null,
    sourceJobId: null,
    sourceArtifactId: null,
    startedAt: null,
    finishedAt: null,
    approvedAt: null,
    publishedAt: null,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    ...data
  }));
  mocks.generate.mockResolvedValue({ questions: [] });
  mocks.recover.mockResolvedValue(0);
  mocks.findArtifacts.mockResolvedValue([]);
  mocks.findSourceArtifact.mockResolvedValue(null);
  mocks.findApprovedQuestions.mockResolvedValue([]);
  mocks.findImportDocuments.mockResolvedValue([{
    id: "document-1",
    generatedOutline: JSON.stringify({ chapters: [{ order: 1 }, { order: 2 }, { order: 3 }] })
  }]);
});

describe("GET /api/courses/:courseId/ai-apps", () => {
  it("uses an explicit safe projection and returns manager errors without input snapshots", async () => {
    mocks.findArtifacts.mockResolvedValue([{ 
      id: "artifact-1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "lesson_plan",
      title: "教案",
      prompt: null,
      payload: null,
      inputSnapshot: "server-only",
      scope: null,
      status: "FAILED",
      version: 1,
      errorCode: "MODEL_TIMEOUT",
      errorMessage: "AI 服务响应超时",
      sourceJobId: null,
      sourceArtifactId: null,
      startedAt: null,
      finishedAt: null,
      approvedAt: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    const response = await GET({ nextUrl: new URL("http://localhost/api/courses/course-1/ai-apps") } as never, context);
    const body = await response.json();

    expect(mocks.recover).toHaveBeenCalledWith();

    expect(mocks.findArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "course-1", deletedAt: null },
      select: expect.not.objectContaining({ inputSnapshot: true })
    }));
    expect(body.artifacts[0]).toMatchObject({ errorCode: "MODEL_TIMEOUT" });
    expect(body.artifacts[0]).not.toHaveProperty("inputSnapshot");
  });

  it("only queries published artifacts for students and hides task errors", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findArtifacts.mockResolvedValue([{
      id: "artifact-1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "lesson_plan",
      title: "公开教案",
      prompt: "private",
      payload: "{}",
      scope: "private",
      status: "PUBLISHED",
      version: 1,
      errorCode: null,
      errorMessage: null,
      sourceJobId: "private-job",
      sourceArtifactId: "private-source",
      startedAt: new Date(),
      finishedAt: new Date(),
      approvedAt: new Date(),
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    const response = await GET({ nextUrl: new URL("http://localhost/api/courses/course-1/ai-apps") } as never, context);
    const body = await response.json();

    expect(mocks.findArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: "course-1", deletedAt: null, status: "PUBLISHED" }
    }));
    expect(Object.keys(body.artifacts[0]).sort()).toEqual([
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
});

describe("POST /api/courses/:courseId/ai-apps", () => {
  it("rejects a chunked JSON body over 16KB before building context", async () => {
    const oversized = new Request("http://localhost/api/courses/course-1/ai-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"appType":"lesson_plan","prompt":"'));
          controller.enqueue(new TextEncoder().encode("a".repeat(17_000)));
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const response = await POST(oversized as never, context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "AI_GENERATION_BODY_TOO_LARGE",
      error: "AI 生成请求内容过大",
      retryable: false
    });
    expect(mocks.buildContext).not.toHaveBeenCalled();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["title", { title: "题".repeat(201) }],
    ["prompt", { prompt: "要求".repeat(2_001) }]
  ])("rejects an oversized %s field before creating an artifact", async (_field, body) => {
    const response = await POST(request("lesson_plan", body) as never, context);

    expect(response.status).toBe(400);
    expect(mocks.buildContext).not.toHaveBeenCalled();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it("allows only one in-flight creation for the same user and course", async () => {
    vi.resetModules();
    const freshRoute = await import("../../src/app/api/courses/[courseId]/ai-apps/route");
    let finishContext!: (value: Record<string, unknown>) => void;
    mocks.buildContext.mockImplementationOnce(() => new Promise((resolve) => { finishContext = resolve; }));

    const first = freshRoute.POST(request("lesson_plan") as never, context);
    await vi.waitFor(() => expect(mocks.buildContext).toHaveBeenCalledTimes(1));
    const concurrent = await freshRoute.POST(request("lesson_plan") as never, context);

    expect(concurrent.status).toBe(429);
    await expect(concurrent.json()).resolves.toMatchObject({
      code: "AI_GENERATION_RATE_LIMITED",
      retryable: true
    });
    expect(mocks.createArtifact).not.toHaveBeenCalled();
    finishContext({ course: { id: "course-1", title: "课程" }, scope: { kind: "course", id: "course-1", label: "全课程" } });
    await expect(first).resolves.toMatchObject({ status: 202 });
  });

  it("reserves global backlog capacity so concurrent different keys cannot both pass", async () => {
    vi.resetModules();
    const freshRoute = await import("../../src/app/api/courses/[courseId]/ai-apps/route");
    const secondContext = { params: Promise.resolve({ courseId: "course-2" }) };
    let globalCountCalls = 0;
    let finishSecondGlobalCount!: (value: number) => void;
    const secondGlobalCount = new Promise<number>((resolve) => { finishSecondGlobalCount = resolve; });
    mocks.countArtifacts.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if ("courseId" in where || "userId" in where) return 0;
      globalCountCalls += 1;
      return globalCountCalls === 1 ? 199 : secondGlobalCount;
    });
    let finishCreate!: (value: Record<string, unknown>) => void;
    const defaultArtifact = {
      id: "artifact-1",
      seriesId: "series-1",
      courseId: "course-1",
      userId: "teacher-1",
      appType: "lesson_plan",
      title: "教案",
      prompt: null,
      payload: null,
      scope: null,
      status: "QUEUED",
      version: 1,
      errorCode: null,
      errorMessage: null,
      sourceJobId: null,
      sourceArtifactId: null,
      startedAt: null,
      finishedAt: null,
      approvedAt: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mocks.createArtifact.mockImplementationOnce(() => new Promise((resolve) => { finishCreate = resolve; }));

    const first = freshRoute.POST(request("lesson_plan") as never, context);
    await vi.waitFor(() => expect(mocks.createArtifact).toHaveBeenCalledTimes(1));
    mocks.requireUser.mockResolvedValue({ id: "teacher-2", role: "TEACHER" });
    const secondRequest = freshRoute.POST(request("lesson_plan") as never, secondContext);
    await vi.waitFor(() => expect(globalCountCalls).toBe(2));
    finishCreate(defaultArtifact);
    finishSecondGlobalCount(199);
    const second = await secondRequest;

    expect(second.status).toBe(503);
    await expect(second.json()).resolves.toMatchObject({
      code: "AI_GENERATION_CAPACITY_REACHED",
      retryable: true
    });
    expect(mocks.createArtifact).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toMatchObject({ status: 202 });
  });

  it.each([
    { questions: [] },
    { questions: [
      { id: "q-1", type: "single_choice", stem: "题一" },
      { id: "q-2", type: "short_answer", stem: "题二" }
    ] }
  ])("rejects paper assembly before enqueue when fewer than three approved questions exist", async ({ questions }) => {
    mocks.findApprovedQuestions.mockResolvedValue(questions);

    const response = await POST(request("paper_assembly") as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "QUESTION_BANK_INSUFFICIENT",
      error: "已审核题目不足，请先生成并审核至少 3 道题目"
    });
    expect(mocks.findApprovedQuestions).toHaveBeenCalledWith({
      where: { courseId: "course-1", status: "APPROVED" },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 500,
      select: { id: true, type: true, stem: true }
    });
    expect(mocks.buildContext).not.toHaveBeenCalled();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("queues paper assembly with only approved current-course question IDs selected by the server", async () => {
    const approvedQuestions = [
      { id: "q-1", type: "single_choice", stem: "题一" },
      { id: "q-2", type: "multiple_choice", stem: "题二" },
      { id: "q-3", type: "short_answer", stem: "题三" }
    ];
    mocks.findApprovedQuestions.mockResolvedValue(approvedQuestions);

    const response = await POST(request("paper_assembly", { prompt: "覆盖第一章" }) as never, context);

    expect(response.status).toBe(202);
    const createData = mocks.createArtifact.mock.calls[0][0].data;
    expect(JSON.parse(createData.inputSnapshot)).toEqual({
      appType: "paper_assembly",
      context: expect.objectContaining({ course: expect.any(Object), scope: expect.any(Object) }),
      approvedQuestions
    });
    expect(mocks.enqueue).toHaveBeenCalledWith("artifact-1");
  });

  it("has no client input for forged paper question IDs", async () => {
    const response = await POST(request("paper_assembly", { questionIds: ["foreign-q"] }) as never, context);

    expect(response.status).toBe(400);
    expect(mocks.findApprovedQuestions).not.toHaveBeenCalled();
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it.each([
    [null, "missing or cross-course"],
    [{ id: "source-1", appType: "courseware", status: "DRAFT", payload: JSON.stringify({ slides: [{ title: "标题", bullets: ["要点"], speakerNotes: "备注" }] }) }, "draft"],
    [{ id: "source-1", appType: "lesson_plan", status: "APPROVED", payload: JSON.stringify({ slides: [{ title: "标题", bullets: ["要点"], speakerNotes: "备注" }] }) }, "wrong type"],
    [{ id: "source-1", appType: "courseware", status: "APPROVED", payload: "not-json" }, "invalid payload"]
  ])("rejects an invalid PPT source: %s (%s)", async (source, _label) => {
    mocks.findSourceArtifact.mockResolvedValue(source);

    const response = await POST(request("ppt_courseware", { sourceArtifactId: "source-1" }) as never, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "AI_PREREQUISITE_REQUIRED",
      error: "请先生成并确认 AI 课件后再生成 PPT 课件"
    });
    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("creates one PPT history row from an approved courseware snapshot without HTML generation", async () => {
    const sourceCourseware = { slides: [{ title: "标题原文", bullets: ["要点原文"], speakerNotes: "备注原文" }] };
    mocks.findSourceArtifact.mockResolvedValue({
      id: "source-1",
      appType: "courseware",
      status: "APPROVED",
      payload: JSON.stringify(sourceCourseware)
    });

    const response = await POST(request("ppt_courseware", {
      sourceArtifactId: "source-1",
      prompt: "课堂展示"
    }) as never, context);

    expect(response.status).toBe(201);
    expect(mocks.findSourceArtifact).toHaveBeenCalledWith({
      where: { id: "source-1", courseId: "course-1" },
      select: { id: true, appType: true, status: true, payload: true }
    });
    const createData = mocks.createArtifact.mock.calls[0][0].data;
    expect(createData.sourceArtifactId).toBe("source-1");
    expect(createData.appType).toBe("ppt_courseware");
    expect(createData.status).toBe("APPROVED");
    expect(createData.approvedAt).toBeInstanceOf(Date);
    expect(createData.inputSnapshot).toBeNull();
    expect(JSON.parse(createData.payload)).toEqual(sourceCourseware);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("queues AI courseware only from a confirmed lesson-plan snapshot and preserves its exact source version", async () => {
    const lessonPayload = {
      objectives: ["目标"], keyPoints: ["重点"],
      teachingProcess: [{ phase: "导入", minutes: 10, activity: "讨论" }], assessment: ["测验"]
    };
    const lessonInputSnapshot = JSON.stringify({
      appType: "lesson_plan",
      context: validContext,
      sourceSnapshot: { outlineVersion: 3, documents: [{ documentId: "document-1", sectionIds: ["chapter-1"] }] }
    });
    mocks.findSourceArtifact.mockResolvedValue({
      id: "lesson-1", version: 4, payload: JSON.stringify(lessonPayload), inputSnapshot: lessonInputSnapshot
    });

    const response = await POST(request("courseware", { sourceArtifactId: "lesson-1" }) as never, context);

    expect(response.status).toBe(202);
    const snapshot = JSON.parse(mocks.createArtifact.mock.calls[0][0].data.inputSnapshot);
    expect(snapshot).toEqual({
      appType: "courseware",
      context: validContext,
      sourceLessonPlan: lessonPayload,
      sourceSnapshot: { sourceArtifactId: "lesson-1", sourceArtifactVersion: 4, sourceInputSnapshot: lessonInputSnapshot }
    });
    expect(mocks.createArtifact.mock.calls[0][0].data.sourceArtifactId).toBe("lesson-1");
  });

  it("requires sourceArtifactId only for PPT generation and retires HTML generation", async () => {
    let response = await POST(request("ppt_courseware") as never, context);
    expect(response.status).toBe(400);

    response = await POST(request("lesson_plan", { sourceArtifactId: "source-1" }) as never, context);
    expect(response.status).toBe(400);
    expect(mocks.findSourceArtifact).not.toHaveBeenCalled();

    response = await POST(request("html_courseware", { sourceArtifactId: "source-1" }) as never, context);
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "HTML_COURSEWARE_RETIRED" });
  });

  it("creates a queued artifact and returns 202 without waiting for the model", async () => {
    const response = await POST(request("question_generation", { prompt: "生成五道题" }) as never, context);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.createArtifact).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId: "course-1",
        userId: "teacher-1",
        appType: "question_generation",
        status: "QUEUED",
        version: 1,
        payload: null,
        inputSnapshot: expect.any(String),
        scope: JSON.stringify({ kind: "course" })
      }),
      select: expect.any(Object)
    });
    const createData = mocks.createArtifact.mock.calls[0][0].data;
    expect(JSON.parse(createData.inputSnapshot)).toEqual({
      appType: "question_generation",
      context: expect.objectContaining({ course: expect.any(Object), scope: expect.any(Object) })
    });
    expect(body.artifact).not.toHaveProperty("inputSnapshot");
    expect(mocks.enqueue).toHaveBeenCalledWith("artifact-1");
  });

  it("returns a stable 400 response for malformed JSON", async () => {
    const malformed = new Request("http://localhost/api/courses/course-1/ai-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json"
    });

    const response = await POST(malformed as never, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_REQUEST", error: "生成参数无效" });
  });

  it.each([
    { kind: "chapter" },
    { kind: "chapter", chapterId: "" },
    { kind: "course", sourceId: "arbitrary-source" },
    { kind: "source", sourceId: "arbitrary-source" }
  ])("rejects an invalid or arbitrary scope with the stable scope protocol", async (scope) => {
    const response = await POST(request("lesson_plan", { scope }) as never, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_AI_SCOPE", error: "所选课程范围无效" });
    expect(mocks.buildContext).not.toHaveBeenCalled();
  });

  it("builds a server-owned chapter context and persists it as the exact queued snapshot", async () => {
    const aiContext = { course: { id: "course-1", title: "课程" }, scope: { kind: "chapter", id: "chapter-1", label: "章节：第一章" } };
    mocks.buildContext.mockResolvedValue(aiContext);

    const response = await POST(request("lesson_plan", { scope: { kind: "chapter", chapterId: "chapter-1" }, prompt: "补充要求" }) as never, context);

    expect(response.status).toBe(202);
    const sourceSelections = [{ documentId: "document-1", sectionIds: [] }];
    expect(mocks.buildContext).toHaveBeenCalledWith({ courseId: "course-1", scope: { kind: "chapter", chapterId: "chapter-1" }, prompt: "补充要求", sourceSelections });
    expect(JSON.parse(mocks.createArtifact.mock.calls[0][0].data.inputSnapshot)).toEqual({
      appType: "lesson_plan",
      context: aiContext,
      sourceSnapshot: { outlineVersion: 0, documents: sourceSelections }
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns INVALID_AI_SCOPE when the server cannot find the chapter inside this course", async () => {
    mocks.buildContext.mockRejectedValue(new InvalidAiScopeError());

    const response = await POST(request("lesson_plan", { scope: { kind: "chapter", chapterId: "foreign" } }) as never, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_AI_SCOPE", error: "所选课程范围无效" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns a stable 413 when safe context bounding cannot satisfy the hard limit", async () => {
    mocks.buildContext.mockRejectedValue(new AiContextTooLargeError());

    const response = await POST(request("lesson_plan") as never, context);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: "AI_CONTEXT_TOO_LARGE", error: "课程上下文过大，请缩小生成范围" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
