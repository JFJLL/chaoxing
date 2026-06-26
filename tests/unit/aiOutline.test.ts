import { describe, expect, it } from "vitest";
import { generatedCourseOutlineSchema } from "../../src/lib/ai/courseOutlineSchema";
import { createFallbackOutline, parseOutlineOrFallback, resolveAiModelConfig } from "../../src/lib/ai/generateCourseOutline";
import { buildGeminiGenerateContentUrl } from "../../src/lib/ai/modelClient";

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

  it("resolves neutral and lowercase AI env names", () => {
    const previous = {
      AI_API_KEY: process.env.AI_API_KEY,
      AI_BASE_URL: process.env.AI_BASE_URL,
      AI_MODEL: process.env.AI_MODEL,
      AI_PROVIDER: process.env.AI_PROVIDER,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      apiKey: process.env.apiKey,
      baseUrl: process.env.baseUrl,
      model: process.env.model
    };

    process.env.AI_API_KEY = "";
    process.env.AI_BASE_URL = "";
    process.env.AI_MODEL = "";
    process.env.AI_PROVIDER = "";
    process.env.OPENAI_API_KEY = "";
    process.env.OPENAI_BASE_URL = "";
    process.env.OPENAI_MODEL = "";
    process.env.apiKey = "gemini-key";
    process.env.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    process.env.model = "gemini-test";

    expect(resolveAiModelConfig()).toEqual({
      provider: "gemini",
      apiKey: "gemini-key",
      baseURL: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-test"
    });

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("builds Gemini native generateContent URLs", () => {
    const url = buildGeminiGenerateContentUrl({
      provider: "gemini",
      apiKey: "gemini-key",
      baseURL: "https://generativelanguage.googleapis.com/v1beta",
      model: "models/gemini-2.5-flash"
    });

    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gemini-key");
  });
});
