import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";

export const generationRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 10,
  windowMs: 60_000,
  maxConcurrent: 1
});

export function resetAiGenerationRequestGuard() {
  generationRequestGuard.reset();
}
