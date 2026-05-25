import { describe, expect, it } from "vitest";
import { generatedCourseOutlineSchema } from "../../src/lib/ai/courseOutlineSchema";
import { createFallbackOutline, parseOutlineOrFallback } from "../../src/lib/ai/generateCourseOutline";

const validOutline = {
  title: "数字阅读服务培训",
  description: "面向馆员的数字阅读服务培训课程。",
  targetAudience: "公共图书馆馆员",
  learningObjectives: ["理解服务入口", "掌握活动策划", "学会数据复盘"],
  chapters: [1, 2, 3].map((chapter) => ({
    title: `第${chapter}章 服务主题`,
    summary: "围绕服务主题展开学习。",
    order: chapter,
    lessons: [
      {
        title: "服务认知",
        summary: "学习基础概念和场景。",
        order: 1,
        estimatedMinutes: 30,
        keyPoints: ["服务入口", "读者需求"],
        suggestedActivities: ["完成案例讨论"],
        assessmentPrompts: ["说明本节重点"]
      }
    ]
  }))
};

describe("course outline generation schema", () => {
  it("accepts a correct outline", () => {
    expect(generatedCourseOutlineSchema.parse(validOutline).title).toBe(validOutline.title);
  });

  it("rejects a missing chapter title", () => {
    const invalid = structuredClone(validOutline);
    invalid.chapters[0].title = "";
    expect(() => generatedCourseOutlineSchema.parse(invalid)).toThrow();
  });

  it("rejects empty lesson lists", () => {
    const invalid = structuredClone(validOutline);
    invalid.chapters[0].lessons = [];
    expect(() => generatedCourseOutlineSchema.parse(invalid)).toThrow();
  });

  it("falls back deterministically when model JSON is invalid", () => {
    const input = {
      courseTitle: "数字阅读服务培训",
      documentText: "# 服务认知\n\n## 活动策划\n\n## 数据分析",
      chunks: ["# 服务认知\n\n## 活动策划\n\n## 数据分析"]
    };
    const result = parseOutlineOrFallback("{not json", input);
    expect(result.warning).toContain("无法解析");
    expect(result.outline).toEqual(createFallbackOutline(input));
  });
});
