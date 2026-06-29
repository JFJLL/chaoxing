import { describe, expect, it } from "vitest";
import { generatedCourseOutlineSchema } from "../../src/lib/ai/courseOutlineSchema";
import { createFallbackOutline, parseOutlineOrFallback, resolveAiModelConfig } from "../../src/lib/ai/generateCourseOutline";
import { buildGeminiGenerateContentUrl } from "../../src/lib/ai/modelClient";
import { buildCourseOutlinePrompt } from "../../src/lib/ai/prompts";

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

const aiEnvNames = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "GEMINI_PROVIDER",
  "GOOGLE_API_KEY",
  "GOOGLE_BASE_URL",
  "GOOGLE_MODEL",
  "GOOGLE_PROVIDER",
  "GOOGLE_AI_BASE_URL",
  "GOOGLE_AI_MODEL",
  "GOOGLE_AI_PROVIDER",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "apiKey",
  "baseUrl",
  "model",
  "key",
  "url",
  "provider",
  "api_key",
  "base_url",
  "apiUrl",
  "api_url",
  "modelName",
  "model_name",
  "aiProvider",
  "geminiApiKey",
  "googleApiKey"
] as const;

function snapshotAiEnv() {
  return Object.fromEntries(aiEnvNames.map((name) => [name, process.env[name]])) as Record<(typeof aiEnvNames)[number], string | undefined>;
}

function restoreAiEnv(previous: Record<(typeof aiEnvNames)[number], string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearAiEnv() {
  for (const name of aiEnvNames) {
    delete process.env[name];
  }
}

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

  it("normalizes Chinese-key model output into the course outline schema", () => {
    const input = {
      courseTitle: "测试课程",
      documentText: "# 第一章 概述\n# 第二章 方法\n# 第三章 实践",
      chunks: ["# 第一章 概述\n# 第二章 方法\n# 第三章 实践"]
    };
    const raw = JSON.stringify({
      课程名称: "测试课程",
      课程目录: [
        { 章节: "第一章 概述", 课时: ["1.1 背景", "1.2 目标"] },
        { 章节: "第二章 方法", 课时: ["2.1 流程", "2.2 案例"] },
        { 章节: "第三章 实践", 课时: ["3.1 练习", "3.2 评价"] }
      ]
    });

    const result = parseOutlineOrFallback(raw, input);

    expect(result.warning).toBeUndefined();
    expect(result.outline.title).toBe("测试课程");
    expect(result.outline.chapters[0].title).toBe("第一章 概述");
    expect(result.outline.chapters[0].lessons[0].title).toBe("1.1 背景");
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const input = {
      courseTitle: "数字阅读服务培训",
      documentText: "# 服务认知\n# 活动策划\n# 数据分析",
      chunks: ["# 服务认知\n# 活动策划\n# 数据分析"]
    };
    const raw = `\`\`\`json\n${JSON.stringify(validOutline)}\n\`\`\``;

    const result = parseOutlineOrFallback(raw, input);

    expect(result.warning).toBeUndefined();
    expect(result.outline.title).toBe(validOutline.title);
  });

  it("asks the model to use the required English JSON keys", () => {
    const prompt = buildCourseOutlinePrompt({ courseTitle: "测试课程", documentText: "测试内容" });

    expect(prompt).toContain("必须使用下面的英文 JSON 字段名");
    expect(prompt).toContain("\"chapters\"");
    expect(prompt).toContain("\"lessons\"");
  });

  it("resolves neutral and lowercase AI env names", () => {
    const previous = snapshotAiEnv();

    try {
      clearAiEnv();
      process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
      process.env.OPENAI_MODEL = "gpt-4.1-mini";
      process.env.apiKey = "gemini-key";
      process.env.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
      process.env.model = "gemini-test";

      expect(resolveAiModelConfig()).toEqual({
        provider: "gemini",
        apiKey: "gemini-key",
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-test"
      });
    } finally {
      restoreAiEnv(previous);
    }
  });

  it("resolves Google and Gemini env aliases", () => {
    const previous = snapshotAiEnv();

    try {
      clearAiEnv();
      process.env.GOOGLE_API_KEY = "google-key";
      process.env.GEMINI_MODEL = "gemini-alias-model";

      expect(resolveAiModelConfig()).toEqual({
        provider: "gemini",
        apiKey: "google-key",
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-alias-model"
      });
    } finally {
      restoreAiEnv(previous);
    }
  });

  it("infers Gemini native provider from Gemini model names with custom base URLs", () => {
    const previous = snapshotAiEnv();

    try {
      clearAiEnv();
      process.env.key = "custom-gemini-key";
      process.env.url = "https://example-gemini-proxy.local";
      process.env.model = "gemini-3.1-flash-lite-preview";

      expect(resolveAiModelConfig()).toEqual({
        provider: "gemini",
        apiKey: "custom-gemini-key",
        baseURL: "https://example-gemini-proxy.local",
        model: "gemini-3.1-flash-lite-preview"
      });
    } finally {
      restoreAiEnv(previous);
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

  it("adds a Gemini API version when base URL is only a host", () => {
    const url = buildGeminiGenerateContentUrl({
      provider: "gemini",
      apiKey: "gemini-key",
      baseURL: "https://api.im-red-magic.cn",
      model: "gemini-3.1-flash-lite-preview"
    });

    expect(url).toBe("https://api.im-red-magic.cn/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=gemini-key");
  });
});
