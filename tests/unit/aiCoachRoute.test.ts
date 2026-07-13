import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  requireCourseOwner: vi.fn(),
  isTeacher: vi.fn(),
  findTasks: vi.fn(),
  findTask: vi.fn(),
  createTask: vi.fn(),
  updateTasks: vi.fn(),
  findAttempts: vi.fn(),
  createAttempt: vi.fn(),
  findAttempt: vi.fn(),
  updateAttempts: vi.fn(),
  updateAttempt: vi.fn(),
  findMessages: vi.fn(),
  createMessage: vi.fn(),
  createTextStream: vi.fn(),
  createJson: vi.fn(),
  transaction: vi.fn(),
  completeAttempt: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({
  requireCourseAccess: mocks.requireCourseAccess,
  requireCourseOwner: mocks.requireCourseOwner,
  isTeacher: mocks.isTeacher
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    aiCoachTask: {
      findMany: mocks.findTasks,
      findFirst: mocks.findTask,
      create: mocks.createTask,
      updateMany: mocks.updateTasks
    },
    courseAiConversation: {
      findMany: mocks.findAttempts,
      findFirst: mocks.findAttempt,
      create: mocks.createAttempt,
      updateMany: mocks.updateAttempts,
      update: mocks.updateAttempt
    },
    courseAiMessage: { findMany: mocks.findMessages, create: mocks.createMessage }
  }
}));
vi.mock("@/lib/ai/modelClient", () => ({
  createTextCompletionStream: mocks.createTextStream,
  createJsonCompletion: mocks.createJson
}));

import { GET as getTasks, POST as createTask } from "../../src/app/api/courses/[courseId]/ai-coach/tasks/route";
import { PUT as updateTask } from "../../src/app/api/courses/[courseId]/ai-coach/tasks/[taskId]/route";
import { GET as getAttempts, POST as createAttempt } from "../../src/app/api/courses/[courseId]/ai-coach/attempts/route";
import { GET as getAttemptDetail } from "../../src/app/api/courses/[courseId]/ai-coach/attempts/[attemptId]/route";
import { POST as sendCoachMessage } from "../../src/app/api/courses/[courseId]/ai-coach/attempts/[attemptId]/messages/route";
import { POST as evaluateAttempt } from "../../src/app/api/courses/[courseId]/ai-coach/attempts/[attemptId]/evaluate/route";
import { readAiStream, type AiStreamEvent } from "../../src/lib/ai/streamProtocol";
import { resetCoachModelRequestGuard } from "../../src/lib/courseWorkspace/aiCoach";

const courseContext = { params: Promise.resolve({ courseId: "course-1" }) };
const taskContext = { params: Promise.resolve({ courseId: "course-1", taskId: "task-1" }) };
const attemptContext = { params: Promise.resolve({ courseId: "course-1", attemptId: "attempt-1" }) };
const requestId = "11111111-1111-4111-8111-111111111111";
const taskBody = {
  title: "需求访谈",
  scenario: "访谈社区居民",
  aiRole: "社区居民",
  objective: "识别真实需求",
  rubricDimensions: [{ name: "提问质量", description: "开放提问", maxScore: 5 }],
  completionCriteria: "完成三轮对话"
};

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function storedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    courseId: "course-1",
    createdById: "teacher-1",
    title: taskBody.title,
    scenario: taskBody.scenario,
    aiRole: taskBody.aiRole,
    objective: taskBody.objective,
    rubric: JSON.stringify(taskBody.rubricDimensions),
    completionCriteria: taskBody.completionCriteria,
    status: "DRAFT",
    version: 1,
    publishedAt: null,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    ...overrides
  };
}

beforeEach(() => {
  resetCoachModelRequestGuard();
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
  mocks.requireCourseOwner.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
  mocks.isTeacher.mockImplementation((user: { role: string }) => user.role === "TEACHER" || user.role === "ADMIN");
  mocks.findTasks.mockResolvedValue([]);
  mocks.findTask.mockResolvedValue(null);
  mocks.findAttempts.mockResolvedValue([]);
  mocks.findMessages.mockResolvedValue([]);
  mocks.updateAttempts.mockResolvedValue({ count: 1 });
  mocks.completeAttempt.mockResolvedValue({ count: 1 });
  mocks.updateAttempt.mockResolvedValue({});
  mocks.updateTasks.mockResolvedValue({ count: 1 });
  mocks.createTask.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => storedTask(data));
  mocks.createAttempt.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "attempt-1",
    courseId: "course-1",
    userId: "student-1",
    kind: "COACH",
    status: "ACTIVE",
    evaluation: null,
    evaluationStatus: "PENDING",
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    coachTask: storedTask({ status: "PUBLISHED" }),
    ...data
  }));
  let messageNumber = 0;
  mocks.createMessage.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `message-${++messageNumber}`,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    ...data
  }));
  mocks.findAttempt.mockResolvedValue({
    id: "attempt-1",
    courseId: "course-1",
    userId: "student-1",
    kind: "COACH",
    status: "ACTIVE",
    evaluationStatus: "PENDING",
    coachTaskId: "task-1",
    coachTask: storedTask({ status: "PUBLISHED" })
  });
  mocks.createTextStream.mockResolvedValue((async function* () { yield "我是社区居民。"; yield "请继续提问。"; })());
  mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
    courseAiMessage: { create: mocks.createMessage },
    courseAiConversation: { updateMany: mocks.completeAttempt }
  }));
});

describe("AI coach task routes", () => {
  it("allows only a course owner to create a task", async () => {
    mocks.requireCourseOwner.mockRejectedValueOnce(new Error("需要教师权限"));
    const denied = await createTask(jsonRequest("POST", taskBody), courseContext);
    expect(denied.status).toBe(403);
    expect(mocks.createTask).not.toHaveBeenCalled();

    const response = await createTask(jsonRequest("POST", taskBody), courseContext);
    expect(response.status).toBe(201);
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        courseId: "course-1",
        createdById: "teacher-1",
        rubric: JSON.stringify(taskBody.rubricDimensions),
        status: "DRAFT"
      })
    }));
  });

  it("rejects client-owned lineage and publication fields on create", async () => {
    const response = await createTask(jsonRequest("POST", { ...taskBody, courseId: "foreign", status: "PUBLISHED" }), courseContext);
    expect(response.status).toBe(400);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("shows students only published tasks while managers can list every status", async () => {
    mocks.requireUser.mockResolvedValueOnce({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValueOnce({ id: "course-1", ownerId: "teacher-1" });
    await getTasks(new Request("http://localhost"), courseContext);
    expect(mocks.findTasks).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { courseId: "course-1", status: "PUBLISHED" }
    }));

    await getTasks(new Request("http://localhost"), courseContext);
    expect(mocks.findTasks).toHaveBeenLastCalledWith(expect.objectContaining({ where: { courseId: "course-1" } }));
  });

  it("keeps a published task rubric immutable after attempts can reference it", async () => {
    mocks.findTask.mockResolvedValue(storedTask({ status: "PUBLISHED" }));
    const response = await updateTask(jsonRequest("PUT", {
      rubricDimensions: [{ name: "被篡改", description: "被篡改", maxScore: 100 }]
    }), taskContext);
    expect(response.status).toBe(409);
    expect(mocks.updateTasks).not.toHaveBeenCalled();
  });

  it("lets the owner publish a draft without accepting a forged creator or course", async () => {
    mocks.findTask.mockResolvedValue(storedTask());
    const response = await updateTask(jsonRequest("PUT", { status: "PUBLISHED" }), taskContext);
    expect(response.status).toBe(200);
    expect(mocks.updateTasks).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", courseId: "course-1", status: "DRAFT", version: 1 },
      data: expect.objectContaining({ status: "PUBLISHED", publishedAt: expect.any(Date) })
    }));
  });
});

describe("AI coach attempt routes", () => {
  it("starts only from a published task in the same course and copies no client rubric", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findTask.mockResolvedValue(storedTask({ status: "PUBLISHED" }));

    const response = await createAttempt(jsonRequest("POST", { taskId: "task-1" }), courseContext);
    expect(response.status).toBe(201);
    expect(mocks.findTask).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", courseId: "course-1", status: "PUBLISHED" }
    }));
    expect(mocks.createAttempt).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        courseId: "course-1",
        userId: "student-1",
        kind: "COACH",
        status: "ACTIVE",
        title: taskBody.title,
        coachTaskId: "task-1",
        evaluationStatus: "PENDING"
      }
    }));
  });

  it("rejects student rubric or role overrides before reading the task", async () => {
    const response = await createAttempt(jsonRequest("POST", { taskId: "task-1", aiRole: "attacker" }), courseContext);
    expect(response.status).toBe(400);
    expect(mocks.findTask).not.toHaveBeenCalled();
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it("does not start from a draft, missing, or cross-course task", async () => {
    mocks.findTask.mockResolvedValue(null);
    const response = await createAttempt(jsonRequest("POST", { taskId: "foreign-task" }), courseContext);
    expect(response.status).toBe(409);
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it("scopes student attempt history to the authenticated user while managers can review the course", async () => {
    mocks.requireUser.mockResolvedValueOnce({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValueOnce({ id: "course-1", ownerId: "teacher-1" });
    await getAttempts(new Request("http://localhost"), courseContext);
    expect(mocks.findAttempts).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { courseId: "course-1", kind: "COACH", userId: "student-1" }
    }));

    await getAttempts(new Request("http://localhost"), courseContext);
    expect(mocks.findAttempts).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { courseId: "course-1", kind: "COACH" }
    }));
  });
});

describe("AI coach conversation and evaluation routes", () => {
  it("rechecks same-course attempt ownership, claims the turn, and stores the assistant only after a complete stream", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([{ id: "old-1", role: "ASSISTANT", content: "欢迎开始", createdAt: new Date() }]);
    const response = await sendCoachMessage(jsonRequest("POST", { message: "我想了解您不参加活动的原因。", requestId }), attemptContext);
    const events: AiStreamEvent[] = [];
    await readAiStream(response, (event) => events.push(event));

    expect(mocks.findAttempt).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "attempt-1", courseId: "course-1", kind: "COACH", userId: "student-1" }
    }));
    expect(mocks.updateAttempts).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "attempt-1", courseId: "course-1", userId: "student-1", kind: "COACH", status: "ACTIVE" },
      data: { status: "GENERATING", generationToken: expect.any(String) }
    }));
    expect(mocks.createMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: { id: requestId, conversationId: "attempt-1", role: "USER", content: "我想了解您不参加活动的原因。" }
    }));
    expect(mocks.createMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { conversationId: "attempt-1", role: "ASSISTANT", content: "我是社区居民。请继续提问。" }
    }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(events.map((event) => event.type)).toEqual(["meta", "delta", "delta", "done"]);
    const token = mocks.updateAttempts.mock.calls[0]![0].data.generationToken;
    expect(mocks.completeAttempt).toHaveBeenCalledWith({
      where: { id: "attempt-1", status: "GENERATING", generationToken: token },
      data: { status: "ACTIVE", generationToken: null }
    });
  });

  it("rejects a corrupted server task before claiming or persisting a turn", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findAttempt.mockResolvedValue({
      id: "attempt-1",
      courseId: "course-1",
      userId: "student-1",
      kind: "COACH",
      status: "ACTIVE",
      coachTask: storedTask({ status: "PUBLISHED", rubric: "not-json" })
    });
    const response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    expect(response.status).toBe(409);
    expect(mocks.updateAttempts).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("emits an explicit retryable error and stores no assistant when the model stream fails", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.createTextStream.mockResolvedValue((async function* () {
      yield "半条回答";
      throw new Error("Bearer secret-token");
    })());
    const response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    const events: AiStreamEvent[] = [];
    await readAiStream(response, (event) => events.push(event));

    expect(events.at(-1)).toMatchObject({ type: "error", code: "MODEL_REQUEST_FAILED" });
    expect(JSON.stringify(events)).not.toContain("secret-token");
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    const token = mocks.updateAttempts.mock.calls[0]![0].data.generationToken;
    expect(mocks.updateAttempts).toHaveBeenLastCalledWith({
      where: { id: "attempt-1", status: "GENERATING", generationToken: token },
      data: { status: "ACTIVE", generationToken: null }
    });
  });

  it("retries the latest failed user message without duplicating it", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([{ id: "user-1", role: "USER", content: "原问题", createdAt: new Date() }]);
    const response = await sendCoachMessage(jsonRequest("POST", { retryMessageId: "user-1" }), attemptContext);
    await readAiStream(response, () => {});

    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { conversationId: "attempt-1", role: "ASSISTANT", content: "我是社区居民。请继续提问。" }
    }));
  });

  it("requires a UUID requestId and uses it as the durable user message id", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    let response = await sendCoachMessage(jsonRequest("POST", { message: "开始" }), attemptContext);
    expect(response.status).toBe(400);

    response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    await readAiStream(response, () => {});
    expect(mocks.createMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: { id: requestId, conversationId: "attempt-1", role: "USER", content: "开始" }
    }));
  });

  it("rejects a coach message body above 8KB before any model work", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    const response = await sendCoachMessage(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "9000" },
      body: JSON.stringify({ message: "开始", requestId })
    }), attemptContext);
    expect(response.status).toBe(413);
    expect(mocks.createTextStream).not.toHaveBeenCalled();
  });

  it("limits model concurrency across attempts for the same user and course until cancel settles", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    let resume!: () => void;
    const wait = new Promise<void>((resolve) => { resume = resolve; });
    mocks.createTextStream.mockResolvedValueOnce((async function* () { await wait; yield "迟到内容"; })());
    const first = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    const second = await sendCoachMessage(jsonRequest("POST", {
      message: "并发请求",
      requestId: "22222222-2222-4222-8222-222222222222"
    }), attemptContext);
    expect(second.status).toBe(429);
    await first.body?.cancel();
    const generationToken = mocks.updateAttempts.mock.calls[0]![0].data.generationToken;
    expect(mocks.updateAttempts).toHaveBeenCalledWith({
      where: { id: "attempt-1", status: "GENERATING", generationToken },
      data: { status: "ACTIVE", generationToken: null }
    });
    resume();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it("claims the generation lease inside the save transaction before creating the assistant", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    const response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    await readAiStream(response, () => {});

    expect(mocks.completeAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.createMessage.mock.invocationCallOrder[1]!);
  });

  it("releases the model guard when claiming or reloading the conversation fails", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.updateAttempts.mockRejectedValueOnce(new Error("database unavailable"));
    const failedClaim = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    expect(failedClaim.status).toBe(502);

    let response = await sendCoachMessage(jsonRequest("POST", {
      message: "再次开始",
      requestId: "22222222-2222-4222-8222-222222222222"
    }), attemptContext);
    expect(response.status).not.toBe(429);
    await readAiStream(response, () => {});

    resetCoachModelRequestGuard();
    mocks.findMessages.mockReset();
    mocks.findMessages.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("message read failed"));
    const failedReload = await sendCoachMessage(jsonRequest("POST", {
      message: "第三次开始",
      requestId: "33333333-3333-4333-8333-333333333333"
    }), attemptContext);
    expect(failedReload.status).toBe(502);

    mocks.findMessages.mockResolvedValue([]);
    response = await sendCoachMessage(jsonRequest("POST", {
      message: "第四次开始",
      requestId: "44444444-4444-4444-8444-444444444444"
    }), attemptContext);
    expect(response.status).not.toBe(429);
    await readAiStream(response, () => {});
  });

  it("treats a pre-meta resend with the same requestId and content as an idempotent retry", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([{ id: requestId, role: "USER", content: "开始", createdAt: new Date() }]);
    const response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    await readAiStream(response, () => {});

    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { conversationId: "attempt-1", role: "ASSISTANT", content: "我是社区居民。请继续提问。" }
    }));
  });

  it("rejects a turn that would exceed the hard message or transcript limits", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue(Array.from({ length: 99 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 ? "USER" : "ASSISTANT",
      content: "内容",
      createdAt: new Date(index)
    })));
    let response = await sendCoachMessage(jsonRequest("POST", { message: "超过上限", requestId }), attemptContext);
    expect(response.status).toBe(413);

    mocks.findMessages.mockResolvedValue([{ id: "a-1", role: "ASSISTANT", content: "x".repeat(100_000), createdAt: new Date() }]);
    response = await sendCoachMessage(jsonRequest("POST", { message: "超过上限", requestId }), attemptContext);
    expect(response.status).toBe(413);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("requires retry instead of accepting another user message after an unanswered turn", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([{ id: "user-1", role: "USER", content: "尚未回答", createdAt: new Date() }]);

    const response = await sendCoachMessage(jsonRequest("POST", { message: "重复发送的新问题", requestId }), attemptContext);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_COACH_RETRY_REQUIRED" });
    expect(mocks.updateAttempts).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("rejects a cross-user or busy attempt before persisting a message", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findAttempt.mockResolvedValueOnce(null);
    let response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    expect(response.status).toBe(404);

    mocks.updateAttempts.mockResolvedValueOnce({ count: 0 });
    response = await sendCoachMessage(jsonRequest("POST", { message: "开始", requestId }), attemptContext);
    expect(response.status).toBe(409);
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("stores a strict evaluation only after validating rubric names, scores, and transcript evidence", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([
      { id: "u-1", role: "USER", content: "您更在意活动时间还是活动内容？", createdAt: new Date() },
      { id: "a-1", role: "ASSISTANT", content: "我更在意活动内容。", createdAt: new Date() }
    ]);
    mocks.createJson.mockResolvedValue(JSON.stringify({
      dimensions: [{
        name: "提问质量",
        score: 4,
        evidence: "您更在意活动时间还是活动内容？",
        feedback: "问题清晰"
      }],
      summary: "完成了访谈",
      improvementAdvice: ["继续追问"]
    }));

    const response = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(response.status).toBe(200);
    expect(mocks.updateAttempts).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "attempt-1", courseId: "course-1", userId: "student-1", kind: "COACH", status: "ACTIVE", evaluationStatus: { in: ["PENDING", "FAILED"] } },
      data: { status: "EVALUATING", evaluationStatus: "GENERATING", evaluation: null, generationToken: expect.any(String) }
    }));
    const evaluationToken = mocks.updateAttempts.mock.calls[0]![0].data.generationToken;
    expect(mocks.updateAttempts).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "attempt-1", status: "EVALUATING", evaluationStatus: "GENERATING", generationToken: evaluationToken },
      data: expect.objectContaining({ status: "COMPLETED", evaluationStatus: "COMPLETED", evaluation: expect.any(String), generationToken: null, completedAt: expect.any(Date) })
    }));
    const saved = JSON.parse(mocks.updateAttempts.mock.calls[1]![0].data.evaluation);
    expect(saved.dimensions[0]).toMatchObject({ name: "提问质量", score: 4, maxScore: 5 });
  });

  it("rejects corrupted evaluation rubric before acquiring a model or conversation lease", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findAttempt.mockResolvedValue({
      id: "attempt-1",
      courseId: "course-1",
      userId: "student-1",
      kind: "COACH",
      status: "ACTIVE",
      coachTask: storedTask({ status: "PUBLISHED", rubric: "not-json" })
    });
    mocks.findMessages.mockResolvedValue([
      { id: "u-1", role: "USER", content: "问题", createdAt: new Date() },
      { id: "a-1", role: "ASSISTANT", content: "回答", createdAt: new Date() }
    ]);
    const response = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(response.status).toBe(409);
    expect(mocks.updateAttempts).not.toHaveBeenCalled();
    expect(mocks.createJson).not.toHaveBeenCalled();
  });

  it("releases the evaluation model guard when the conversation claim fails", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([
      { id: "u-1", role: "USER", content: "问题", createdAt: new Date() },
      { id: "a-1", role: "ASSISTANT", content: "回答", createdAt: new Date() }
    ]);
    mocks.updateAttempts.mockRejectedValueOnce(new Error("claim failed"));
    const failedClaim = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(failedClaim.status).toBe(502);

    mocks.createJson.mockResolvedValue(JSON.stringify({
      dimensions: [{ name: "提问质量", score: 4, evidence: "问题", feedback: "反馈" }],
      summary: "总结",
      improvementAdvice: ["建议"]
    }));
    const response = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(response.status).not.toBe(429);
  });

  it("keeps evaluation retryable and stores no partial result when model output invents evidence", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([
      { id: "u-1", role: "USER", content: "真实问题", createdAt: new Date() },
      { id: "a-1", role: "ASSISTANT", content: "真实回答", createdAt: new Date() }
    ]);
    mocks.createJson.mockResolvedValue(JSON.stringify({
      dimensions: [{ name: "提问质量", score: 4, evidence: "伪造证据", feedback: "反馈" }],
      summary: "总结",
      improvementAdvice: ["建议"]
    }));

    const response = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "MODEL_INVALID_OUTPUT", retryable: true });
    expect(mocks.updateAttempt).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ evaluation: expect.stringContaining("伪造证据") }) }));
    expect(mocks.updateAttempts).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "attempt-1", status: "EVALUATING", evaluationStatus: "GENERATING", generationToken: expect.any(String) },
      data: { status: "ACTIVE", evaluationStatus: "FAILED", evaluation: null, generationToken: null }
    }));
  });

  it("rejects evaluation explicitly when the persisted transcript exceeds hard limits", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.findMessages.mockResolvedValue([
      { id: "u-1", role: "USER", content: "问题", createdAt: new Date() },
      { id: "a-1", role: "ASSISTANT", content: "x".repeat(100_001), createdAt: new Date() }
    ]);
    const response = await evaluateAttempt(new Request("http://localhost", { method: "POST" }), attemptContext);
    expect(response.status).toBe(413);
    expect(mocks.createJson).not.toHaveBeenCalled();
  });

  it("returns bounded attempt summaries and loads one owned detail on demand", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    mocks.findAttempts.mockResolvedValue([]);
    await getAttempts(new Request("http://localhost"), courseContext);
    expect(mocks.findAttempts).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));

    mocks.findAttempt.mockResolvedValue({
      id: "attempt-1",
      courseId: "course-1",
      userId: "student-1",
      kind: "COACH",
      status: "ACTIVE",
      title: taskBody.title,
      evaluation: null,
      evaluationStatus: "PENDING",
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      coachTask: storedTask({ status: "PUBLISHED" }),
      messages: []
    });
    const response = await getAttemptDetail(new Request("http://localhost"), attemptContext);
    expect(response.status).toBe(200);
    expect(mocks.findAttempt).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "attempt-1", courseId: "course-1", kind: "COACH", userId: "student-1" },
      include: expect.objectContaining({ messages: expect.objectContaining({ take: 100 }) })
    }));
  });

  it("paginates attempt summaries with a stable cursor instead of making older records unreachable", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    mocks.findAttempts.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({
      id: `attempt-${index}`,
      courseId: "course-1",
      userId: "student-1",
      kind: "COACH",
      status: "ACTIVE",
      title: `练习 ${index}`,
      evaluation: null,
      evaluationStatus: "PENDING",
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      coachTask: storedTask({ status: "PUBLISHED" }),
      _count: { messages: 0 },
      messages: []
    })));

    const response = await getAttempts(new Request("http://localhost/api/courses/course-1/ai-coach/attempts?cursor=attempt-before"), courseContext);
    const body = await response.json();
    expect(mocks.findAttempts).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { id: "attempt-before" },
      skip: 1,
      take: 51
    }));
    expect(body.attempts).toHaveLength(50);
    expect(body.nextCursor).toBe("attempt-49");
  });

  it("recovers stale generating and evaluating attempts before returning a list", async () => {
    mocks.requireUser.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", ownerId: "teacher-1" });
    await getAttempts(new Request("http://localhost"), courseContext);
    expect(mocks.updateAttempts).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ courseId: "course-1", userId: "student-1", kind: "COACH", status: "GENERATING", updatedAt: { lt: expect.any(Date) } }),
      data: { status: "ACTIVE", generationToken: null }
    }));
    expect(mocks.updateAttempts).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ courseId: "course-1", userId: "student-1", kind: "COACH", status: "EVALUATING", updatedAt: { lt: expect.any(Date) } }),
      data: { status: "ACTIVE", generationToken: null, evaluationStatus: "FAILED", evaluation: null }
    }));
  });
});
