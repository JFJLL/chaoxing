export const TEACHER_ONBOARDING_VERSION = 2;
export const TEACHER_ONBOARDING_MAX_AUTO_PROMPTS = 3;
export const TEACHER_ONBOARDING_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type TeacherOnboardingRecord = {
  onboardingState: string | null;
  onboardingVersion: number;
  onboardingPromptCount: number;
  onboardingLastPromptAt: Date | null;
  onboardingLastSessionId: string | null;
};

export function isTeacherOnboardingComplete(record: Pick<TeacherOnboardingRecord, "onboardingState" | "onboardingVersion">) {
  return record.onboardingState === "COMPLETED" && record.onboardingVersion >= TEACHER_ONBOARDING_VERSION;
}

export function canAutoPromptTeacherOnboarding(
  record: TeacherOnboardingRecord,
  sessionId: string | undefined,
  now = new Date()
) {
  if (!sessionId || isTeacherOnboardingComplete(record)) return false;
  if (record.onboardingLastSessionId === sessionId) return false;
  if (record.onboardingPromptCount >= TEACHER_ONBOARDING_MAX_AUTO_PROMPTS) return false;
  if (!record.onboardingLastPromptAt) return true;
  return now.getTime() - record.onboardingLastPromptAt.getTime() >= TEACHER_ONBOARDING_PROMPT_COOLDOWN_MS;
}

export function clampTeacherOnboardingStep(step: unknown, stepCount: number) {
  if (typeof step !== "number" || !Number.isInteger(step)) return 0;
  return Math.min(Math.max(step, 0), Math.max(stepCount - 1, 0));
}
