import { describe, expect, it, vi } from "vitest";
import { generatedCourseOutlineSchema } from "../../src/lib/ai/courseOutlineSchema";
import { generateCourseOutline, parseGeneratedOutline, resolveAiModelConfig } from "../../src/lib/ai/generateCourseOutline";
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

const outlineInput = {
  courseTitle: "数字阅读服务培训",
  documentText: "# 服务认知\n\n## 活动策划\n\n## 数据分析",
  chunks: ["# 服务认知\n\n## 活动策划\n\n## 数据分析"]
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

  it("rejects invalid model output instead of creating a local template", () => {
    expect(() => parseGeneratedOutline("not-json", outlineInput)).toThrowError(
      expect.objectContaining({ code: "MODEL_INVALID_OUTPUT" })
    );
  });

  it("rejects generation when no model is configured", async () => {
    const previous = snapshotAiEnv();

    try {
      clearAiEnv();
      await expect(generateCourseOutline(outlineInput)).rejects.toMatchObject({
        code: "MODEL_NOT_CONFIGURED"
      });
    } finally {
      restoreAiEnv(previous);
    }
  });

  it("rejects generation with a safe error when the model request fails", async () => {
    const previous = snapshotAiEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Bearer secret-token request failed"));

    try {
      clearAiEnv();
      process.env.GEMINI_API_KEY = "gemini-key";

      await expect(generateCourseOutline(outlineInput)).rejects.toMatchObject({
        code: "MODEL_REQUEST_FAILED",
        message: "AI 服务调用失败：Bearer *** request failed"
      });
    } finally {
      fetchMock.mockRestore();
      restoreAiEnv(previous);
    }
  });

  it("retries once when the first model output is invalid and then succeeds", async () => {
    const previous = snapshotAiEnv();
    const gemini = (raw: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: raw }] } }] }) });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(gemini("not-json") as unknown as Response)
      .mockResolvedValueOnce(gemini(JSON.stringify(validOutline)) as unknown as Response);
    try {
      clearAiEnv();
      process.env.GEMINI_API_KEY = "gemini-key";
      const result = await generateCourseOutline(outlineInput);
      expect(result.outline.title).toBe("数字阅读服务培训");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      restoreAiEnv(previous);
    }
  });

  it("fails after retrying when the model keeps returning invalid output", async () => {
    const previous = snapshotAiEnv();
    const bad = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "still-not-json" }] } }] }) };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(bad as unknown as Response);
    try {
      clearAiEnv();
      process.env.GEMINI_API_KEY = "gemini-key";
      await expect(generateCourseOutline(outlineInput)).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      restoreAiEnv(previous);
    }
  });

  it("normalizes Chinese-key model output into the course outline schema", () => {
    const input = {
      courseTitle: "测试课程",
      documentText: "# 第一章 概述\n# 第二章 方法\n# 第三章 实践",
      chunks: ["# 第一章 概述\n# 第二章 方法\n# 第三章 实践"]
    };
    const raw = JSON.stringify({
      课程名称: "测试课程",
      课程简介: "面向测试人员的完整课程内容说明。",
      目标学习者: "测试人员",
      学习目标: ["理解课程背景", "掌握实践方法", "完成综合练习"],
      课程目录: ["概述", "方法", "实践"].map((name, index) => ({
        章节: `第${index + 1}章 ${name}`,
        概述: `围绕${name}主题展开系统学习。`,
        序号: index + 1,
        课时: [
          {
            课时标题: `${index + 1}.1 ${name}基础`,
            概述: `学习${name}主题的基础概念。`,
            序号: 1,
            时长: 30,
            知识点: [`${name}概念`, `${name}应用`],
            课堂活动: [`完成${name}案例讨论`],
            检测问题: [`说明${name}主题的核心要点`]
          }
        ]
      }))
    });

    const result = parseGeneratedOutline(raw, input);

    expect(result.title).toBe("测试课程");
    expect(result.chapters[0].title).toBe("第1章 概述");
    expect(result.chapters[0].lessons[0].title).toBe("1.1 概述基础");
  });

  it("rejects sparse Chinese-key output instead of filling required content locally", () => {
    const raw = JSON.stringify({
      课程名称: "测试课程",
      课程目录: [
        { 章节: "第一章 概述", 课时: ["1.1 背景"] },
        { 章节: "第二章 方法", 课时: ["2.1 流程"] },
        { 章节: "第三章 实践", 课时: ["3.1 练习"] }
      ]
    });

    expect(() => parseGeneratedOutline(raw, outlineInput)).toThrowError(
      expect.objectContaining({ code: "MODEL_INVALID_OUTPUT" })
    );
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const input = {
      courseTitle: "数字阅读服务培训",
      documentText: "# 服务认知\n# 活动策划\n# 数据分析",
      chunks: ["# 服务认知\n# 活动策划\n# 数据分析"]
    };
    const raw = `\`\`\`json\n${JSON.stringify(validOutline)}\n\`\`\``;

    const result = parseGeneratedOutline(raw, input);

    expect(result.title).toBe(validOutline.title);
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
