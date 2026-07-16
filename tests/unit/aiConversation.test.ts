import { describe, expect, it } from "vitest";
import {
  assertTutorConversationAccess,
  boundTutorHistory,
  buildTutorSystemPrompt,
  resolveTutorUserTurn,
  selectTutorSources
} from "../../src/lib/courseWorkspace/aiConversation";
import type { CourseKnowledgeSource } from "../../src/lib/courseWorkspace/courseKnowledgeSources";

const sources: CourseKnowledgeSource[] = [
  { id: "chapter:1:1", type: "chapter", label: "数据分析基础", snippet: "均值用于描述集中趋势。", href: "/space/courses/course-1/structure" },
  { id: "lesson:2:1", type: "lesson", label: "访谈方法", snippet: "开放式问题用于收集受访者经验。", href: "/space/courses/course-1/structure" },
  { id: "question:3:1", type: "question", label: "教师题库", snippet: "答案：仅教师可见。", href: "/space/courses/course-1/question-bank" }
];

describe("AI tutor conversation", () => {
  it("rejects cross-course, cross-user, and non-tutor conversation IDs", () => {
    for (const conversation of [
      { id: "c", courseId: "other", userId: "user-1", kind: "TUTOR" },
      { id: "c", courseId: "course-1", userId: "other", kind: "TUTOR" },
      { id: "c", courseId: "course-1", userId: "user-1", kind: "COPILOT" },
      null
    ]) {
      expect(() => assertTutorConversationAccess(conversation, {
        courseId: "course-1",
        userId: "user-1"
      })).toThrowError(expect.objectContaining({ code: "AI_CONVERSATION_NOT_FOUND", status: 404 }));
    }
  });

  it("ranks only matching server-owned sources and never invents a source", () => {
    const selected = selectTutorSources("怎么设计开放式访谈问题？", sources, 2);

    expect(selected).toEqual([sources[1]]);
    expect(selected.every((source) => sources.includes(source))).toBe(true);
  });

  it("builds a bounded citation prompt and explicitly refuses unsupported answers", () => {
    const prompt = buildTutorSystemPrompt(sources.slice(0, 2));

    expect(prompt).toContain("只依据下列课程资料回答");
    expect(prompt).toContain("资料不足");
    expect(prompt).toContain("[1] 数据分析基础");
    expect(prompt).not.toContain("教师题库");
  });

  it("uses an explicit no-context instruction when retrieval has no match", () => {
    expect(buildTutorSystemPrompt([])).toContain("没有检索到与问题直接相关的内容");
  });

  it("bounds conversation history by characters while preserving the latest user turn", () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `${index}-` + "x".repeat(10_000)
    }));

    const bounded = boundTutorHistory(history, 24_000);

    expect(bounded.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(24_000);
    expect(bounded.at(-1)?.content).toContain("19-");
    expect(bounded.length).toBeLessThan(history.length);
  });

  it("only retries the final unanswered user message", () => {
    const messages = [
      { id: "a", role: "USER", content: "A", createdAt: new Date(0) },
      { id: "b", role: "USER", content: "B", createdAt: new Date(1) }
    ];

    expect(() => resolveTutorUserTurn(messages, { retryMessageId: "a" })).toThrowError(
      expect.objectContaining({ code: "AI_RETRY_NOT_AVAILABLE", status: 409 })
    );
    expect(resolveTutorUserTurn(messages, { retryMessageId: "b" }).userMessage.id).toBe("b");
  });

  it("reuses a stable request ID after a pre-meta disconnect without duplicating the user message", () => {
    const requestId = "c3d10ed0-dad5-4ea4-88e6-1591fb3be0e6";
    const messages = [{ id: requestId, role: "USER", content: "原问题", createdAt: new Date(0) }];

    expect(resolveTutorUserTurn(messages, { message: "原问题", requestId })).toMatchObject({
      userMessage: messages[0],
      isNewMessage: false
    });
    expect(() => resolveTutorUserTurn(messages, { message: "篡改问题", requestId })).toThrowError(
      expect.objectContaining({ code: "AI_MESSAGE_IDEMPOTENCY_CONFLICT", status: 409 })
    );
  });
});
