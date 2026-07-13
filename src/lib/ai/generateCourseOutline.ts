import type { GeneratedCourseOutline } from "@/types/course";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createJsonCompletion, resolveAiModelConfig, type AiModelConfig } from "@/lib/ai/modelClient";
import { buildCourseOutlinePrompt } from "@/lib/ai/prompts";

type GenerateCourseOutlineInput = {
  courseTitle: string;
  documentText: string;
  chunks: string[];
  model?: string;
};

type GenerateCourseOutlineResult = {
  outline: GeneratedCourseOutline;
};

export { resolveAiModelConfig, type AiModelConfig };

function recordValue(input: unknown, key: string) {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function stringArrayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }
  const single = stringValue(value);
  return single ? [single] : [];
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }
  return trimmed;
}

function normalizeLooseOutline(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return null;

  const rawChapters = recordValue(parsed, "chapters") ?? recordValue(parsed, "课程目录") ?? recordValue(parsed, "章节") ?? recordValue(parsed, "目录");
  if (!Array.isArray(rawChapters) || rawChapters.length === 0) return null;

  const chapters = rawChapters.map((chapter) => {
    const chapterTitle = stringValue(
      recordValue(chapter, "title"),
      recordValue(chapter, "章节"),
      recordValue(chapter, "章节标题"),
      recordValue(chapter, "标题"),
      chapter
    );
    const rawLessons =
      recordValue(chapter, "lessons") ??
      recordValue(chapter, "课时") ??
      recordValue(chapter, "小节") ??
      recordValue(chapter, "课程内容") ??
      recordValue(chapter, "内容");
    const lessonInputs = Array.isArray(rawLessons) ? rawLessons : [];

    return {
      title: chapterTitle,
      summary: stringValue(recordValue(chapter, "summary"), recordValue(chapter, "简介"), recordValue(chapter, "概述")),
      order: numberValue(recordValue(chapter, "order"), recordValue(chapter, "序号")),
      lessons: lessonInputs.map((lesson) => {
        const lessonTitle = stringValue(recordValue(lesson, "title"), recordValue(lesson, "课时"), recordValue(lesson, "课时标题"), recordValue(lesson, "标题"), lesson);
        const keyPoints = stringArrayValue(recordValue(lesson, "keyPoints") ?? recordValue(lesson, "知识点"));
        const suggestedActivities = stringArrayValue(recordValue(lesson, "suggestedActivities") ?? recordValue(lesson, "课堂活动") ?? recordValue(lesson, "活动"));
        const assessmentPrompts = stringArrayValue(recordValue(lesson, "assessmentPrompts") ?? recordValue(lesson, "检测问题") ?? recordValue(lesson, "评价"));

        return {
          title: lessonTitle,
          summary: stringValue(recordValue(lesson, "summary"), recordValue(lesson, "简介"), recordValue(lesson, "概述")),
          order: numberValue(recordValue(lesson, "order"), recordValue(lesson, "序号")),
          estimatedMinutes: numberValue(recordValue(lesson, "estimatedMinutes"), recordValue(lesson, "时长")),
          keyPoints,
          suggestedActivities,
          assessmentPrompts
        };
      })
    };
  });

  return {
    title: stringValue(recordValue(parsed, "title"), recordValue(parsed, "课程名称")),
    description: stringValue(recordValue(parsed, "description"), recordValue(parsed, "课程简介")),
    targetAudience: stringValue(recordValue(parsed, "targetAudience"), recordValue(parsed, "目标学习者")),
    learningObjectives: stringArrayValue(recordValue(parsed, "learningObjectives") ?? recordValue(parsed, "学习目标")),
    chapters
  };
}

export function parseGeneratedOutline(raw: string, input: GenerateCourseOutlineInput): GeneratedCourseOutline {
  try {
    const parsed = JSON.parse(extractJsonText(raw)) as unknown;
    const direct = generatedCourseOutlineSchema.safeParse(parsed);
    if (direct.success) return direct.data;

    const normalized = normalizeLooseOutline(parsed);
    const normalizedResult = generatedCourseOutlineSchema.safeParse(normalized);
    if (normalizedResult.success) return normalizedResult.data;
  } catch {
    // Invalid JSON is reported with the same stable error as an invalid schema.
  }
  throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回的课程目录格式无效，请重试");
}

export async function generateCourseOutline(input: GenerateCourseOutlineInput): Promise<GenerateCourseOutlineResult> {
  const config = resolveAiModelConfig(input.model);
  if (!config) {
    throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请联系管理员检查模型设置");
  }

  try {
    const raw = await createJsonCompletion({
      model: config.model,
      system: "你只输出符合约束的 JSON 对象。",
      user: buildCourseOutlinePrompt({
        courseTitle: input.courseTitle,
        documentText: input.chunks[0] || input.documentText
      })
    });

    return { outline: parseGeneratedOutline(raw || "", input) };
  } catch (error) {
    throw toSafeAiError(error);
  }
}
