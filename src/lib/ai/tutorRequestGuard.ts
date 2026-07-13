import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";

export const tutorRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 20,
  windowMs: 60_000,
  maxConcurrent: 1
});

export function resetAiTutorRequestGuard() {
  tutorRequestGuard.reset();
}
