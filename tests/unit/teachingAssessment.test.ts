import { describe, expect, it } from "vitest";
import { gradeObjectiveAnswer, summarizeObjectiveGrades } from "@/lib/teaching/assessment";

describe("assessment grading", () => {
  it("grades single choice answers exactly", () => {
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "B", response: " B ", points: 4 })).toBe(4);
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "B", response: "A", points: 4 })).toBe(0);
  });

  it("grades multiple choice answers independent of order", () => {
    expect(gradeObjectiveAnswer({ type: "multiple_choice", answer: "A,C", response: "C, A", points: 6 })).toBe(6);
    expect(gradeObjectiveAnswer({ type: "multiple_choice", answer: "A,C", response: "A,B,C", points: 6 })).toBe(0);
  });

  it("leaves short answers for teacher grading", () => {
    expect(gradeObjectiveAnswer({ type: "short_answer", answer: "示例", response: "回答", points: 10 })).toBeNull();
  });

  it("summarizes only auto-gradable questions", () => {
    expect(summarizeObjectiveGrades([
      { type: "single_choice", answer: "A", response: "A", points: 3 },
      { type: "multiple_choice", answer: "A,C", response: "A,B", points: 5 },
      { type: "short_answer", answer: "说明", response: "回答", points: 10 }
    ])).toEqual({ score: 3, autoGradedPoints: 8, pendingManualCount: 1 });
  });
});
