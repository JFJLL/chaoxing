import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  courseFindFirst: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate
    },
    course: {
      findFirst: mocks.courseFindFirst
    }
  }
}));

import { PUT } from "@/app/api/onboarding/route";

const user = {
  id: "teacher-1",
  name: "王老师",
  role: "TEACHER" as const,
  institutionId: "institution-1",
  sessionId: "login-session-2"
};

function record(overrides: Partial<{
  onboardingState: string | null;
  onboardingVersion: number;
  onboardingStep: number;
  onboardingCourseId: string | null;
  onboardingPromptCount: number;
  onboardingLastPromptAt: Date | null;
  onboardingLastSessionId: string | null;
}> = {}) {
  return {
    onboardingState: "IN_PROGRESS",
    onboardingVersion: 2,
    onboardingStep: 1,
    onboardingCourseId: null,
    onboardingPromptCount: 0,
    onboardingLastPromptAt: null,
    onboardingLastSessionId: null,
    ...overrides
  };
}

describe("PUT /api/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(user);
    mocks.courseFindFirst.mockResolvedValue({ id: "course-1" });
  });

  it("binds the teacher's latest accessible course before restoring an unfinished guide", async () => {
    mocks.userFindUnique.mockResolvedValue(record());
    mocks.userUpdate.mockResolvedValue({
      onboardingState: "IN_PROGRESS",
      onboardingStep: 1,
      onboardingCourseId: "course-1",
      onboardingPromptCount: 1
    });

    const response = await PUT(new NextRequest("http://localhost/api/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "START_SESSION" })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      show: true,
      onboardingStep: 1,
      onboardingCourseId: "course-1"
    });
    expect(mocks.courseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { ownerId: "teacher-1" },
          { collaborators: { some: { userId: "teacher-1" } } }
        ]
      }),
      orderBy: { updatedAt: "desc" }
    }));
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ onboardingCourseId: "course-1" })
    }));
  });

  it("keeps the selected course when advancing into the first course-workbench explanation", async () => {
    mocks.userFindUnique.mockResolvedValue(record({ onboardingCourseId: "course-1", onboardingStep: 1 }));
    mocks.userUpdate.mockResolvedValue({
      onboardingState: "IN_PROGRESS",
      onboardingStep: 2,
      onboardingCourseId: "course-1",
      onboardingPromptCount: 1
    });

    const response = await PUT(new NextRequest("http://localhost/api/onboarding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "SAVE_STEP", step: 2 })
    }));

    await expect(response.json()).resolves.toMatchObject({
      show: true,
      onboardingStep: 2,
      onboardingCourseId: "course-1"
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ onboardingStep: 2 })
    }));
  });
});
