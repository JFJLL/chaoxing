import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAiModelConfig: vi.fn(),
  createJsonCompletion: vi.fn()
}));

vi.mock("@/lib/ai/modelClient", () => ({
  resolveAiModelConfig: mocks.resolveAiModelConfig,
  createJsonCompletion: mocks.createJsonCompletion
}));

import { recommendCoursewareSlideCount, SLIDE_COUNT_MAX } from "../../src/lib/courseWorkspace/recommendSlideCount";
import type { AiLessonPlanPayload } from "../../src/types/courseWorkspace";

const lessonPlan: AiLessonPlanPayload = {
  objectives: ["理解概念", "掌握方法"],
  keyPoints: ["重点一"],
  teachingProcess: [
    { phase: "导入", minutes: 10, activity: "情境引入" },
    { phase: "讲解", minutes: 30, activity: "知识讲授" },
    { phase: "总结", minutes: 25, activity: "归纳提升" }
  ],
  assessment: ["课堂提问"]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAiModelConfig.mockReturnValue({ provider: "openai-compatible", apiKey: "k", baseURL: "http://x", model: "m" });
});

describe("recommendCoursewareSlideCount", () => {
  it("returns a validated recommendation", async () => {
    mocks.createJsonCompletion.mockResolvedValue(JSON.stringify({ recommendedSlideCount: 12, reason: "结构完整，建议12页" }));
    const result = await recommendCoursewareSlideCount({ title: "文化市场营销教案", lessonPlan });
    expect(result).toEqual({ recommendedSlideCount: 12, reason: "结构完整，建议12页" });
  });

  it("rejects invalid JSON with a stable safe error", async () => {
    mocks.createJsonCompletion.mockResolvedValue("这不是JSON");
    await expect(recommendCoursewareSlideCount({ title: "教案", lessonPlan })).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
  });

  it("rejects an out-of-range page count instead of using it", async () => {
    mocks.createJsonCompletion.mockResolvedValue(JSON.stringify({ recommendedSlideCount: SLIDE_COUNT_MAX + 20, reason: "越界" }));
    await expect(recommendCoursewareSlideCount({ title: "教案", lessonPlan })).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
  });

  it("fails clearly when no model is configured", async () => {
    mocks.resolveAiModelConfig.mockReturnValue(null);
    await expect(recommendCoursewareSlideCount({ title: "教案", lessonPlan })).rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED" });
    expect(mocks.createJsonCompletion).not.toHaveBeenCalled();
  });
});
