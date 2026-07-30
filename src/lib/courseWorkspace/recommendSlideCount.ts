import { z } from "zod";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createJsonCompletion, resolveAiModelConfig } from "@/lib/ai/modelClient";
import type { AiLessonPlanPayload } from "@/types/courseWorkspace";

// The manual slide-count control's allowed range. Kept here as the single
// source of truth so the recommendation can never propose a value the teacher
// could not enter by hand.
export const SLIDE_COUNT_MIN = 5;
export const SLIDE_COUNT_MAX = 16;

const recommendationSchema = z
  .object({
    recommendedSlideCount: z.number().int().min(SLIDE_COUNT_MIN).max(SLIDE_COUNT_MAX),
    reason: z.string().trim().min(1).max(200)
  })
  .strict();

export type SlideCountRecommendation = z.infer<typeof recommendationSchema>;

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

function invalidRecommendation() {
  return new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回的页数建议无效，请重试");
}

/**
 * Asks the configured model to recommend how many slides the course courseware
 * should have, based purely on the approved lesson plan's teaching structure.
 * The model may not modify the lesson plan and its numeric answer is strictly
 * validated against the manual control's range; out-of-range answers are
 * rejected rather than silently used.
 */
export async function recommendCoursewareSlideCount(input: {
  title: string;
  lessonPlan: AiLessonPlanPayload;
}): Promise<SlideCountRecommendation> {
  const config = resolveAiModelConfig();
  if (!config) throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请先联系管理员完成配置");

  const totalMinutes = input.lessonPlan.teachingProcess.reduce((sum, phase) => sum + phase.minutes, 0);
  const user = [
    "根据以下教案的教学结构，判断课堂课件适合的页数。",
    "只依据教学呈现需要判断，不要机械按文字长度计算；可以考虑封面、课程目标、知识讲解、案例或示例、课堂互动、阶段总结、练习或思考、课后任务等环节。",
    "不得修改教案，也不得新增教案里没有的教学目标。页数只影响后续 AI 课件的目标页数，不生成页面内容。",
    `页数必须是介于 ${SLIDE_COUNT_MIN} 到 ${SLIDE_COUNT_MAX} 之间的整数。`,
    "只输出严格 JSON：{\"recommendedSlideCount\": 整数, \"reason\": \"不超过200字的中文说明\"}。",
    "教案数据：",
    JSON.stringify({
      title: input.title,
      objectiveCount: input.lessonPlan.objectives.length,
      objectives: input.lessonPlan.objectives,
      keyPoints: input.lessonPlan.keyPoints,
      teachingProcess: input.lessonPlan.teachingProcess,
      assessment: input.lessonPlan.assessment,
      totalMinutes,
      minSlideCount: SLIDE_COUNT_MIN,
      maxSlideCount: SLIDE_COUNT_MAX
    })
  ].join("\n");

  try {
    const raw = await createJsonCompletion({
      model: config.model,
      system: "你是课堂课件页数规划助手。你只输出符合约束的 JSON 对象，不输出解释或额外字段。",
      user
    });
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonText(raw || ""));
    } catch {
      throw invalidRecommendation();
    }
    const parsed = recommendationSchema.safeParse(parsedJson);
    if (!parsed.success) throw invalidRecommendation();
    return parsed.data;
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw toSafeAiError(error);
  }
}
