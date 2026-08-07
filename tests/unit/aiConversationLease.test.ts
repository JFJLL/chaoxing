import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(),
  findMessages: vi.fn(),
  createMessage: vi.fn(),
  updateConversation: vi.fn(),
  updateMany: vi.fn(),
  buildCourseKnowledgeSources: vi.fn(),
  searchDriveKnowledgeSources: vi.fn(),
  resolveCourseConversationFiles: vi.fn(),
  searchCourseKnowledge: vi.fn()
}));

vi.mock("@/lib/db", () => {
  const tx = {
    courseAiConversation: {
      findFirst: mocks.findConversation,
      update: mocks.updateConversation
    },
    courseAiMessage: { create: mocks.createMessage }
  };
  return {
    db: {
      courseAiConversation: { findUnique: mocks.findConversation, updateMany: mocks.updateMany },
      courseAiMessage: { findMany: mocks.findMessages, create: mocks.createMessage },
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx))
    }
  };
});
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: vi.fn() }));
vi.mock("@/lib/courseWorkspace/courseKnowledgeSources", () => ({
  buildCourseKnowledgeSources: mocks.buildCourseKnowledgeSources,
  searchDriveKnowledgeSources: mocks.searchDriveKnowledgeSources
}));
vi.mock("@/lib/copilot/files", () => ({
  assertCourseCopilotReferences: vi.fn(),
  listCourseCopilotFiles: vi.fn(),
  resolveCourseConversationFiles: mocks.resolveCourseConversationFiles
}));
vi.mock("@/lib/courseWorkspace/searchCourseKnowledge", () => ({
  searchCourseKnowledge: mocks.searchCourseKnowledge
}));

import {
  abortTutorGeneration,
  completeTutorTurn,
  failTutorTurn,
  prepareTutorTurn,
  registerTutorGeneration,
  unregisterTutorGeneration
} from "../../src/lib/courseWorkspace/aiConversation";

const user = { id: "user-1", name: "测试", role: "TEACHER" as const, institutionId: "institution-1" };

function conversation() {
  return { id: "conversation-1", courseId: "course-1", userId: "user-1", kind: "TUTOR", attachments: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findConversation.mockImplementation(async ({ where }: { where: { generationToken?: string } }) => (
    where.generationToken === "new-token" ? { id: "conversation-1" }
      : where.generationToken ? null
        : conversation()
  ));
  mocks.findMessages.mockResolvedValue([]);
  mocks.createMessage.mockResolvedValue({
    id: "assistant-1",
    role: "ASSISTANT",
    content: "answer",
    citations: "[]",
    createdAt: new Date("2026-07-13T00:00:00.000Z")
  });
  mocks.updateConversation.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.buildCourseKnowledgeSources.mockResolvedValue([]);
  mocks.searchDriveKnowledgeSources.mockResolvedValue([]);
  mocks.resolveCourseConversationFiles.mockResolvedValue([]);
  mocks.searchCourseKnowledge.mockResolvedValue([]);
});

describe("AI tutor generation lease", () => {
  it("rejects an old completion after a new generation replaces the lease", async () => {
    await expect(completeTutorTurn({
      userId: "user-1",
      conversationId: "conversation-1",
      generationToken: "old-token",
      content: "old answer",
      citations: []
    })).rejects.toMatchObject({ code: "AI_CONVERSATION_STATE_CHANGED", status: 409 });

    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.findConversation).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ generationToken: "old-token", status: "GENERATING" })
    }));
  });

  it("scopes failure cleanup to the exact generation token", async () => {
    await failTutorTurn("user-1", "conversation-1", "old-token");

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        userId: "user-1",
        kind: "TUTOR",
        status: "GENERATING",
        generationToken: "old-token"
      },
      data: { status: "ACTIVE", generationToken: null }
    });
  });

  it("releases the lease when preparation fails after the lock was acquired", async () => {
    mocks.searchDriveKnowledgeSources.mockRejectedValue(new Error("来源解析失败"));

    await expect(prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { message: "问题", requestId: "123e4567-e89b-12d3-a456-426614174000" }
    })).rejects.toThrow("来源解析失败");

    const resetCall = mocks.updateMany.mock.calls.find((call) =>
      call[0]?.data?.status === "ACTIVE" && call[0]?.data?.generationToken === null
    );
    expect(resetCall).toBeTruthy();
  });

  it("preempts a conversation still marked GENERATING when the client retries", async () => {
    mocks.findMessages.mockResolvedValue([{ id: "user-1", role: "USER", content: "问题", createdAt: new Date() }]);
    const calls: Array<{ where?: object; data?: object }> = [];
    mocks.updateMany.mockImplementation(async (args: { where?: object; data?: object }) => {
      calls.push(args);
      return { count: 1 };
    });

    await expect(prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { retryMessageId: "user-1" }
    })).resolves.toMatchObject({ conversationId: "conversation-1" });

    // The first write releases the stale lock; the second acquires a fresh lease.
    expect(calls[0]).toMatchObject({
      where: { id: "conversation-1", status: "GENERATING" },
      data: { status: "ACTIVE", generationToken: null }
    });
    expect(calls[1]?.data).toMatchObject({ status: "GENERATING" });
  });

  it("preempts a still-generating conversation for an idempotent resend of the last message", async () => {
    mocks.findMessages.mockResolvedValue([{
      id: "123e4567-e89b-12d3-a456-426614174000",
      role: "USER",
      content: "问题",
      createdAt: new Date()
    }]);
    const calls: Array<{ where?: object; data?: object }> = [];
    mocks.updateMany.mockImplementation(async (args: { where?: object; data?: object }) => {
      calls.push(args);
      return { count: 1 };
    });

    await expect(prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { message: "问题", requestId: "123e4567-e89b-12d3-a456-426614174000" }
    })).resolves.toMatchObject({ conversationId: "conversation-1" });

    expect(calls[0]).toMatchObject({
      where: { id: "conversation-1", status: "GENERATING" },
      data: { status: "ACTIVE", generationToken: null }
    });
  });

  it("bounds citation fields so an over-long source cannot break the meta event", async () => {
    mocks.searchDriveKnowledgeSources.mockResolvedValue([
      {
        id: "drive:file-1:1:1",
        type: "drive",
        label: `问题${"x".repeat(300)}`,
        snippet: `问题${"s".repeat(2_100)}`,
        href: "/api/drive/file-1?preview=1"
      }
    ]);

    const turn = await prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { message: "问题", requestId: "123e4567-e89b-12d3-a456-426614174000" }
    });

    expect(turn.citations[0]?.label.length).toBe(240);
    expect(turn.citations[0]?.snippet.length).toBe(2_000);
  });

  it("keeps FTS drive hits when the LLM ranking is unavailable and the query cannot score English snippets", async () => {
    mocks.searchDriveKnowledgeSources.mockResolvedValue([
      {
        id: "drive:file-1:34:1",
        type: "drive",
        label: "Principles of Marketing（第 34 页）",
        snippet: "Marketing orientations guide marketing strategy.",
        href: "/api/drive/file-1?preview=1"
      }
    ]);

    const turn = await prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { message: "请梳理市场营销的营销理念", requestId: "123e4567-e89b-12d3-a456-426614174000" }
    });

    expect(turn.citations.some((citation) => citation.id === "drive:file-1:34:1")).toBe(true);
  });

  it("merges top FTS drive hits even when the LLM ranking vetoes them in favor of course materials", async () => {
    mocks.searchDriveKnowledgeSources.mockResolvedValue([
      {
        id: "drive:file-1:34:1",
        type: "drive",
        label: "Principles of Marketing（第 34 页）",
        snippet: "Marketing orientations guide marketing strategy.",
        href: "/api/drive/file-1?preview=1"
      }
    ]);
    mocks.buildCourseKnowledgeSources.mockResolvedValue([
      {
        id: "chapter:1:1",
        type: "chapter",
        label: "第一章 营销理念",
        snippet: "中文课程资料里的营销理念内容",
        href: "/space/courses/course-1/structure"
      }
    ]);
    mocks.searchCourseKnowledge.mockResolvedValue([
      {
        id: "chapter:1:1",
        type: "chapter",
        label: "第一章 营销理念",
        snippet: "中文课程资料里的营销理念内容",
        href: "/space/courses/course-1/structure"
      }
    ]);

    const turn = await prepareTutorTurn({
      user,
      courseId: "course-1",
      conversationId: "conversation-1",
      body: { message: "请梳理市场营销的营销理念", requestId: "123e4567-e89b-12d3-a456-426614174000" }
    });

    const ids = turn.citations.map((citation) => citation.id);
    expect(ids).toContain("chapter:1:1");
    expect(ids).toContain("drive:file-1:34:1");
  });

  it("aborts the previous in-flight generation when a retry registers", () => {
    const first = new AbortController();
    const second = new AbortController();
    registerTutorGeneration("conversation-1", first);
    registerTutorGeneration("conversation-1", second);

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    abortTutorGeneration("conversation-1");
    expect(second.signal.aborted).toBe(true);

    unregisterTutorGeneration("conversation-1", second);
    expect(() => abortTutorGeneration("conversation-1")).not.toThrow();
  });
});
