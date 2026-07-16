import { describe, expect, it } from "vitest";
import { buildLearningIndicators } from "@/lib/teaching/analytics";

describe("learning indicators", () => {
  it("keeps each dimension independently explainable", () => {
    expect(buildLearningIndicators({
      lessons: { completed: 3, total: 4 },
      attendance: { present: 2, total: 3 },
      assignments: { submitted: 1, total: 2 },
      exams: { gradedScore: 80, gradedMaxScore: 100 }
    })).toEqual({
      lessonCompletionRate: 75,
      attendanceRate: 67,
      assignmentCompletionRate: 50,
      examAverageRate: 80
    });
  });

  it("returns null when a dimension has no real denominator", () => {
    expect(buildLearningIndicators({
      lessons: { completed: 0, total: 0 },
      attendance: { present: 0, total: 0 },
      assignments: { submitted: 0, total: 0 },
      exams: { gradedScore: 0, gradedMaxScore: 0 }
    })).toEqual({
      lessonCompletionRate: null,
      attendanceRate: null,
      assignmentCompletionRate: null,
      examAverageRate: null
    });
  });
});
