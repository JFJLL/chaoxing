import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseAccess: vi.fn(),
  runAiAssistantAction: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseAccess: mocks.requireCourseAccess }));
vi.mock("@/lib/courseWorkspace/aiAssistantActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/courseWorkspace/aiAssistantActions")>();
  return { ...actual, runAiAssistantAction: mocks.runAiAssistantAction };
});

import { resetAiTutorRequestGuard, tutorRequestGuard } from "../../src/lib/ai/tutorRequestGuard";
import { POST } from "../../src/app/api/courses/[courseId]/ai-assistant/route";

const previousTimeout = process.env.AI_ASSISTANT_TIMEOUT_MS;
const context = { params: Promise.resolve({ courseId: "course-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  resetAiTutorRequestGuard();
  process.env.AI_ASSISTANT_TIMEOUT_MS = "10";
  mocks.requireUser.mockResolvedValue({
    id: "user-1",
    name: "学生",
    role: "STUDENT",
    institutionId: "institution-1"
  });
  mocks.requireCourseAccess.mockResolvedValue({
    id: "course-1",
    title: "文化市场营销学",
    status: "ACTIVE",
    ownerId: "teacher-1"
  });
});

afterEach(() => {
  if (previousTimeout === undefined) delete process.env.AI_ASSISTANT_TIMEOUT_MS;
  else process.env.AI_ASSISTANT_TIMEOUT_MS = previousTimeout;
});

describe("POST /api/courses/[courseId]/ai-assistant", () => {
  it("returns at the hard deadline even when an upstream ignores AbortSignal", async () => {
    let receivedSignal: AbortSignal | undefined;
    mocks.runAiAssistantAction.mockImplementation((input: { signal?: AbortSignal }) => {
      receivedSignal = input.signal;
      return new Promise(() => undefined);
    });

    const response = await POST(new Request("http://localhost/api/courses/course-1/ai-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "knowledge_qa", question: "什么是市场定位？" })
    }), context);

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ code: "MODEL_TIMEOUT" }));
    expect(receivedSignal?.aborted).toBe(true);

    const nextLease = tutorRequestGuard.acquire("user-1:course-1");
    expect(nextLease.allowed).toBe(true);
    if (nextLease.allowed) nextLease.release();
  });
});
