import { describe, expect, it } from "vitest";
import {
  TEACHER_ONBOARDING_MAX_AUTO_PROMPTS,
  TEACHER_ONBOARDING_PROMPT_COOLDOWN_MS,
  canAutoPromptTeacherOnboarding,
  clampTeacherOnboardingStep
} from "@/lib/onboarding/teacherOnboarding";

const now = new Date("2026-08-19T09:00:00.000Z");

function record(overrides: Partial<{
  onboardingState: string | null;
  onboardingVersion: number;
  onboardingPromptCount: number;
  onboardingLastPromptAt: Date | null;
  onboardingLastSessionId: string | null;
}> = {}) {
  return {
    onboardingState: null,
    onboardingVersion: 0,
    onboardingPromptCount: 0,
    onboardingLastPromptAt: null,
    onboardingLastSessionId: null,
    ...overrides
  };
}

describe("teacher onboarding frequency", () => {
  it("shows to an eligible teacher on the first signed-in session", () => {
    expect(canAutoPromptTeacherOnboarding(record(), "session-1", now)).toBe(true);
  });

  it("does not repeat on refreshes or route changes within the same login session", () => {
    expect(canAutoPromptTeacherOnboarding(record({
      onboardingPromptCount: 1,
      onboardingLastPromptAt: now,
      onboardingLastSessionId: "session-1"
    }), "session-1", now)).toBe(false);
  });

  it("waits 24 hours before a skipped guide is restored on a later login", () => {
    const prior = record({
      onboardingPromptCount: 1,
      onboardingLastPromptAt: now,
      onboardingLastSessionId: "session-1"
    });
    expect(canAutoPromptTeacherOnboarding(prior, "session-2", new Date(now.getTime() + TEACHER_ONBOARDING_PROMPT_COOLDOWN_MS - 1))).toBe(false);
    expect(canAutoPromptTeacherOnboarding(prior, "session-2", new Date(now.getTime() + TEACHER_ONBOARDING_PROMPT_COOLDOWN_MS))).toBe(true);
  });

  it("never automatically replays after completion or the three-prompt cap", () => {
    expect(canAutoPromptTeacherOnboarding(record({ onboardingState: "COMPLETED", onboardingVersion: 2 }), "session-2", now)).toBe(false);
    expect(canAutoPromptTeacherOnboarding(record({ onboardingPromptCount: TEACHER_ONBOARDING_MAX_AUTO_PROMPTS }), "session-2", now)).toBe(false);
  });

  it("keeps persisted steps inside the seven-step tour bounds", () => {
    expect(clampTeacherOnboardingStep(-2, 7)).toBe(0);
    expect(clampTeacherOnboardingStep(9, 7)).toBe(6);
    expect(clampTeacherOnboardingStep(3, 7)).toBe(3);
  });
});
