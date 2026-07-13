import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";

export const aiSearchRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 10,
  windowMs: 60_000,
  maxConcurrent: 1
});

export function resetAiSearchRequestGuard() {
  aiSearchRequestGuard.reset();
}
