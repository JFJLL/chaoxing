import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAiModelConfig: vi.fn(),
  uploadFileToGemini: vi.fn(),
  createFileJsonCompletion: vi.fn(),
  createJsonCompletion: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/ai/modelClient", () => ({
  resolveAiModelConfig: mocks.resolveAiModelConfig,
  uploadFileToGemini: mocks.uploadFileToGemini,
  createFileJsonCompletion: mocks.createFileJsonCompletion,
  createJsonCompletion: mocks.createJsonCompletion
}));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));

import { generateCourseOutlineFromPdf } from "@/lib/ai/generateCourseOutline";

const gemini = { provider: "gemini", apiKey: "k", baseURL: "https://api.im-red-magic.cn", model: "gemini-3.6-flash" };

const validOutline = {
  title: "习近平文化思想学习纲要",
  description: "面向学习者的文化思想课程内容说明。",
  targetAudience: "课程学习者",
  learningObjectives: ["理解核心要义", "掌握主要论述", "联系实践应用"],
  chapters: [1, 2, 3].map((n) => ({
    title: `第${n}章 主题`,
    summary: "本章围绕主题展开学习。",
    order: n,
    lessons: [{
      title: `第${n}节 概述`,
      summary: "本节介绍基础内容。",
      order: 1,
      estimatedMinutes: 45,
      keyPoints: ["要点一", "要点二"],
      suggestedActivities: ["课堂讨论"],
      assessmentPrompts: ["复述本节要点"]
    }]
  }))
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAiModelConfig.mockReturnValue(gemini);
  mocks.readFile.mockResolvedValue(Buffer.from("%PDF-1.7 scanned"));
  mocks.uploadFileToGemini.mockResolvedValue({ uri: "https://x/files/abc", mimeType: "application/pdf" });
  mocks.createFileJsonCompletion.mockResolvedValue(JSON.stringify(validOutline));
});

describe("generateCourseOutlineFromPdf", () => {
  it("uploads the PDF and returns the outline parsed from the model's JSON", async () => {
    const result = await generateCourseOutlineFromPdf({ courseTitle: "文化思想", filePath: "/tmp/scan.pdf" });
    expect(result.outline.title).toBe("习近平文化思想学习纲要");
    expect(result.outline.chapters).toHaveLength(3);
    expect(mocks.uploadFileToGemini).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFileToGemini.mock.calls[0][1]).toMatchObject({ mimeType: "application/pdf" });
  });

  it("rejects a non-gemini provider with MODEL_NOT_MULTIMODAL and never uploads", async () => {
    mocks.resolveAiModelConfig.mockReturnValue({ ...gemini, provider: "openai-compatible" });
    await expect(generateCourseOutlineFromPdf({ courseTitle: "x", filePath: "/tmp/scan.pdf" }))
      .rejects.toMatchObject({ code: "MODEL_NOT_MULTIMODAL" });
    expect(mocks.uploadFileToGemini).not.toHaveBeenCalled();
  });

  it("rejects an oversized PDF with PDF_TOO_LARGE and never uploads", async () => {
    mocks.readFile.mockResolvedValue(Buffer.alloc(100 * 1024 * 1024 + 1));
    await expect(generateCourseOutlineFromPdf({ courseTitle: "x", filePath: "/tmp/huge.pdf" }))
      .rejects.toMatchObject({ code: "PDF_TOO_LARGE" });
    expect(mocks.uploadFileToGemini).not.toHaveBeenCalled();
  });

  it("fails with MODEL_NOT_CONFIGURED when no model is configured", async () => {
    mocks.resolveAiModelConfig.mockReturnValue(null);
    await expect(generateCourseOutlineFromPdf({ courseTitle: "x", filePath: "/tmp/scan.pdf" }))
      .rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED" });
  });

  it("surfaces an invalid-output error when the model returns unparseable JSON", async () => {
    mocks.createFileJsonCompletion.mockResolvedValue("not-json");
    await expect(generateCourseOutlineFromPdf({ courseTitle: "x", filePath: "/tmp/scan.pdf" }))
      .rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
  });
});
