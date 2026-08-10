import { describe, expect, it } from "vitest";
import { weightedLessonCompletionRate } from "@/lib/teaching/lessonCompletion";

describe("weighted lesson completion", () => {
  it("weights completed lessons by estimated learning time", () => {
    expect(weightedLessonCompletionRate([
      { id: "short", estimatedMinutes: 30 },
      { id: "long", estimatedMinutes: 90 }
    ], new Set(["short"]))).toBe(25);
  });

  it("uses the mean estimate for lessons without a duration", () => {
    expect(weightedLessonCompletionRate([
      { id: "estimated", estimatedMinutes: 60 },
      { id: "missing", estimatedMinutes: null }
    ], new Set(["missing"]))).toBe(50);
  });

  it("returns no rate when the course has no lessons", () => {
    expect(weightedLessonCompletionRate([], new Set())).toBeNull();
  });
});
