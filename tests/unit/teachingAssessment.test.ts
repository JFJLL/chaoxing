import { describe, expect, it } from "vitest";
import { gradeObjectiveAnswer, summarizeObjectiveGrades } from "@/lib/teaching/assessment";
import { choiceLabel, isValidChoiceAnswer, normalizeChoiceAnswer } from "@/lib/teaching/choiceQuestions";
import { parseOptions } from "@/lib/teaching/assessmentInput";

describe("assessment grading", () => {
  it("grades single choice answers exactly", () => {
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "B", response: " B ", points: 4 })).toBe(4);
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "B", response: "A", points: 4 })).toBe(0);
  });

  it("maps option text and stable option keys to the same answer", () => {
    const options = ["课程", "云盘"];
    expect(normalizeChoiceAnswer("课程", options)).toBe("A");
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "A", response: "课程", points: 10, options })).toBe(10);
    expect(gradeObjectiveAnswer({ type: "single_choice", answer: "课程", response: "A", points: 10, options })).toBe(10);
    expect(choiceLabel("A. 课程", 0)).toBe("A. 课程");
  });

  it("grades multiple choice answers independent of order", () => {
    expect(gradeObjectiveAnswer({ type: "multiple_choice", answer: "A,C", response: "C, A", points: 6 })).toBe(6);
    expect(gradeObjectiveAnswer({ type: "multiple_choice", answer: "A,C", response: "A,B,C", points: 6 })).toBe(0);
  });

  it("normalizes multiple-choice option text without splitting spaces inside an option", () => {
    const options = ["New York", "Los Angeles", "上海"];
    expect(normalizeChoiceAnswer("上海, New York", options, true)).toBe("A,C");
    expect(isValidChoiceAnswer("New York,上海", options, true)).toBe(true);
    expect(normalizeChoiceAnswer("A、C", options, true)).toBe("A,C");
    expect(isValidChoiceAnswer("D", options, true)).toBe(false);

    const commaOptions = ["Paris, France", "Tokyo"];
    expect(normalizeChoiceAnswer("Paris, France", commaOptions, true)).toBe("A");
  });

  it("leaves short answers for teacher grading", () => {
    expect(gradeObjectiveAnswer({ type: "short_answer", answer: "示例", response: "回答", points: 10 })).toBeNull();
  });

  it("tolerates malformed stored option data", () => {
    expect(parseOptions('["A","B"]')).toEqual(["A", "B"]);
    expect(parseOptions("not-json")).toEqual([]);
    expect(parseOptions('{"A":1}')).toEqual([]);
  });

  it("summarizes only auto-gradable questions", () => {
    expect(summarizeObjectiveGrades([
      { type: "single_choice", answer: "A", response: "A", points: 3 },
      { type: "multiple_choice", answer: "A,C", response: "A,B", points: 5 },
      { type: "short_answer", answer: "说明", response: "回答", points: 10 }
    ])).toEqual({ score: 3, autoGradedPoints: 8, pendingManualCount: 1 });
  });
});
