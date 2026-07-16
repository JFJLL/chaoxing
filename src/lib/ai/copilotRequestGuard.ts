import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";

export const copilotRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 10,
  windowMs: 60_000,
  maxConcurrent: 1
});

export function resetCopilotRequestGuard() {
  copilotRequestGuard.reset();
}
