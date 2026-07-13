import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(),
  createMessage: vi.fn(),
  updateConversation: vi.fn(),
  updateMany: vi.fn()
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
      courseAiConversation: { updateMany: mocks.updateMany },
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx))
    }
  };
});
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: vi.fn() }));
vi.mock("@/lib/courseWorkspace/courseKnowledgeSources", () => ({ buildCourseKnowledgeSources: vi.fn() }));

import { completeTutorTurn, failTutorTurn } from "../../src/lib/courseWorkspace/aiConversation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findConversation.mockImplementation(async ({ where }: { where: { generationToken: string } }) => (
    where.generationToken === "new-token" ? { id: "conversation-1" } : null
  ));
  mocks.createMessage.mockResolvedValue({
    id: "assistant-1",
    role: "ASSISTANT",
    content: "answer",
    citations: "[]",
    createdAt: new Date("2026-07-13T00:00:00.000Z")
  });
  mocks.updateConversation.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 0 });
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
});
