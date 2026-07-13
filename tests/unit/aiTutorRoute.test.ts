import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAiStream, type AiStreamEvent } from "../../src/lib/ai/streamProtocol";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  prepareTutorTurn: vi.fn(),
  completeTutorTurn: vi.fn(),
  failTutorTurn: vi.fn(),
  createTextCompletionStream: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: mocks.requireCourseAccess }));
vi.mock("@/lib/ai/modelClient", () => ({ createTextCompletionStream: mocks.createTextCompletionStream }));
vi.mock("@/lib/courseWorkspace/aiConversation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/aiConversation")>();
  return {
    ...actual,
    prepareTutorTurn: mocks.prepareTutorTurn,
    completeTutorTurn: mocks.completeTutorTurn,
    failTutorTurn: mocks.failTutorTurn
  };
});

import { AiConversationError } from "../../src/lib/courseWorkspace/aiConversation";
import { resetAiTutorRequestGuard } from "../../src/lib/ai/tutorRequestGuard";
import { POST } from "../../src/app/api/courses/[courseId]/ai-tutor/conversations/[conversationId]/messages/route";

const context = { params: Promise.resolve({ courseId: "course-1", conversationId: "conversation-1" }) };
const citation = {
  id: "lesson:1:1",
  type: "lesson",
  label: "访谈方法",
  snippet: "开放式问题",
  href: "/space/courses/course-1/structure"
};

async function* chunks(...values: Array<string | Error>) {
  for (const value of values) {
    if (value instanceof Error) throw value;
    yield value;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAiTutorRequestGuard();
  mocks.requireUser.mockResolvedValue({ id: "user-1", role: "STUDENT", institutionId: "institution-1", name: "学生" });
  mocks.requireCourseAccess.mockResolvedValue({ id: "course-1", status: "ACTIVE", ownerId: "teacher-1" });
  mocks.prepareTutorTurn.mockResolvedValue({
    conversationId: "conversation-1",
    generationToken: "generation-1",
    userMessageId: "user-message-1",
    citations: [citation],
    system: "system",
    messages: [{ role: "user", content: "怎么提问？" }]
  });
  mocks.completeTutorTurn.mockResolvedValue({
    id: "assistant-message-1",
    role: "assistant",
    content: "使用开放式问题 [1]",
    citations: [citation],
    createdAt: "2026-07-13T00:00:00.000Z"
  });
  mocks.failTutorTurn.mockResolvedValue(undefined);
});

describe("AI tutor message route", () => {
  it("streams server citations and persists the assistant only after the provider completes", async () => {
    mocks.createTextCompletionStream.mockResolvedValue(chunks("使用", "开放式问题 [1]"));

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "怎么提问？" })
    }), context);
    const events: AiStreamEvent[] = [];
    await readAiStream(response, (event) => events.push(event));

    expect(events.map((event) => event.type)).toEqual(["meta", "delta", "delta", "done"]);
    expect(events[0]).toMatchObject({ citations: [citation], userMessageId: "user-message-1" });
    expect(mocks.completeTutorTurn).toHaveBeenCalledWith(expect.objectContaining({
      content: "使用开放式问题 [1]",
      citations: [citation],
      generationToken: "generation-1"
    }));
    expect(mocks.failTutorTurn).not.toHaveBeenCalled();
  });

  it("does not persist a partial assistant response when the provider fails", async () => {
    mocks.createTextCompletionStream.mockResolvedValue(chunks("partial", Object.assign(new Error("rate limited secret"), { status: 429 })));
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retryMessageId: "user-message-1" })
    }), context);
    const events: AiStreamEvent[] = [];
    await readAiStream(response, (event) => events.push(event));

    expect(events.at(-1)).toEqual({ type: "error", code: "MODEL_RATE_LIMITED", error: "AI 服务繁忙，请稍后重试" });
    expect(mocks.completeTutorTurn).not.toHaveBeenCalled();
    expect(mocks.failTutorTurn).toHaveBeenCalledWith("user-1", "conversation-1", "generation-1");
  });

  it("returns a retryable in-stream error when no model is configured", async () => {
    mocks.createTextCompletionStream.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "问题" })
    }), context);
    const events: AiStreamEvent[] = [];
    await readAiStream(response, (event) => events.push(event));

    expect(events).toEqual([
      expect.objectContaining({ type: "meta", userMessageId: "user-message-1" }),
      { type: "error", code: "MODEL_NOT_CONFIGURED", error: "AI 模型尚未配置，请联系管理员" }
    ]);
    expect(mocks.completeTutorTurn).not.toHaveBeenCalled();
  });

  it("rejects inaccessible conversation IDs before opening a stream", async () => {
    mocks.prepareTutorTurn.mockRejectedValue(new AiConversationError(
      "AI_CONVERSATION_NOT_FOUND",
      "对话不存在或无权访问",
      404
    ));
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "问题" })
    }), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "AI_CONVERSATION_NOT_FOUND",
      error: "对话不存在或无权访问"
    });
    expect(mocks.createTextCompletionStream).not.toHaveBeenCalled();
  });
});
