import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCourseAccess: vi.fn(),
  deleteConversation: vi.fn(),
  deleteDriveFile: vi.fn()
}));

vi.mock("@/lib/permissions", () => ({
  requireCourseAccess: mocks.requireCourseAccess
}));

vi.mock("@/lib/db", () => ({
  db: {
    courseAiConversation: { deleteMany: mocks.deleteConversation },
    driveFile: { delete: mocks.deleteDriveFile }
  }
}));

vi.mock("@/lib/copilot/files", () => ({
  assertCourseCopilotReferences: vi.fn(),
  listCourseCopilotFiles: vi.fn(),
  resolveCourseConversationFiles: vi.fn()
}));

vi.mock("@/lib/courseWorkspace/courseKnowledgeSources", () => ({
  buildCourseDriveKnowledgeSources: vi.fn(),
  buildCourseKnowledgeSources: vi.fn()
}));

import { deleteTutorConversation } from "@/lib/courseWorkspace/aiConversation";

const user = {
  id: "student-1",
  name: "学生",
  role: "STUDENT" as const,
  institutionId: "institution-1"
};

describe("AI tutor conversation deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCourseAccess.mockResolvedValue({ id: "course-1" });
    mocks.deleteConversation.mockResolvedValue({ count: 1 });
  });

  it("deletes only the conversation and preserves referenced Drive files", async () => {
    await deleteTutorConversation(user, "course-1", "conversation-1");

    expect(mocks.deleteConversation).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        courseId: "course-1",
        userId: "student-1",
        kind: "TUTOR"
      }
    });
    expect(mocks.deleteDriveFile).not.toHaveBeenCalled();
  });

  it("does not reveal whether another user's conversation exists", async () => {
    mocks.deleteConversation.mockResolvedValue({ count: 0 });

    await expect(deleteTutorConversation(user, "course-1", "conversation-1")).rejects.toMatchObject({
      code: "AI_CONVERSATION_NOT_FOUND",
      status: 404
    });
  });
});
