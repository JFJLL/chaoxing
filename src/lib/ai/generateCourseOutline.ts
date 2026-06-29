import type { GeneratedCourseOutline } from "@/types/course";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
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
  warning?: string;
};

export { resolveAiModelConfig, type AiModelConfig };

function safeAiErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "未知错误";
  return raw
    .replace(/([?&](?:key|api_key|apiKey)=)[^&\s]+/gi, "$1***")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
    .slice(0, 180);
}

function textLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function headingCandidates(text: string) {
  const headings = textLines(text)
    .filter((line) => /^(#{1,3}\s+|第[一二三四五六七八九十\d]+[章节讲]|[一二三四五六七八九十\d]+[、.．])/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").replace(/^[一二三四五六七八九十\d]+[、.．]\s*/, ""));
  return headings.length ? headings : textLines(text).slice(0, 8);
}

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

function normalizeLooseOutline(parsed: unknown, input: GenerateCourseOutlineInput) {
  if (!parsed || typeof parsed !== "object") return null;

  const rawChapters = recordValue(parsed, "chapters") ?? recordValue(parsed, "课程目录") ?? recordValue(parsed, "章节") ?? recordValue(parsed, "目录");
  if (!Array.isArray(rawChapters) || rawChapters.length === 0) return null;

  const chapters = rawChapters.map((chapter, chapterIndex) => {
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
    const lessonInputs = Array.isArray(rawLessons) && rawLessons.length ? rawLessons : [chapterTitle || `${input.courseTitle} 第${chapterIndex + 1}章`];

    return {
      title: chapterTitle || `${input.courseTitle} 第${chapterIndex + 1}章`,
      summary: stringValue(recordValue(chapter, "summary"), recordValue(chapter, "简介"), recordValue(chapter, "概述")) || `围绕“${chapterTitle}”展开学习。`,
      order: Number(recordValue(chapter, "order") ?? recordValue(chapter, "序号")) || chapterIndex + 1,
      lessons: lessonInputs.map((lesson, lessonIndex) => {
        const lessonTitle = stringValue(recordValue(lesson, "title"), recordValue(lesson, "课时"), recordValue(lesson, "课时标题"), recordValue(lesson, "标题"), lesson);
        const keyPoints = stringArrayValue(recordValue(lesson, "keyPoints") ?? recordValue(lesson, "知识点"));
        const suggestedActivities = stringArrayValue(recordValue(lesson, "suggestedActivities") ?? recordValue(lesson, "课堂活动") ?? recordValue(lesson, "活动"));
        const assessmentPrompts = stringArrayValue(recordValue(lesson, "assessmentPrompts") ?? recordValue(lesson, "检测问题") ?? recordValue(lesson, "评价"));

        return {
          title: lessonTitle || `${chapterTitle} 课时${lessonIndex + 1}`,
          summary:
            stringValue(recordValue(lesson, "summary"), recordValue(lesson, "简介"), recordValue(lesson, "概述")) ||
            `学习“${lessonTitle || chapterTitle}”的核心内容。`,
          order: Number(recordValue(lesson, "order") ?? recordValue(lesson, "序号")) || lessonIndex + 1,
          estimatedMinutes: Number(recordValue(lesson, "estimatedMinutes") ?? recordValue(lesson, "时长")) || 30,
          keyPoints: keyPoints.length >= 2 ? keyPoints : [lessonTitle || chapterTitle, "实践应用"],
          suggestedActivities: suggestedActivities.length ? suggestedActivities : ["阅读材料并完成课堂讨论"],
          assessmentPrompts: assessmentPrompts.length ? assessmentPrompts : [`请说明“${lessonTitle || chapterTitle}”的核心要点。`]
        };
      })
    };
  });

  return {
    title: stringValue(recordValue(parsed, "title"), recordValue(parsed, "课程名称")) || input.courseTitle,
    description: stringValue(recordValue(parsed, "description"), recordValue(parsed, "课程简介")) || `根据上传文档生成的《${input.courseTitle}》课程目录。`,
    targetAudience: stringValue(recordValue(parsed, "targetAudience"), recordValue(parsed, "目标学习者")) || "本课程学习者",
    learningObjectives: (() => {
      const objectives = stringArrayValue(recordValue(parsed, "learningObjectives") ?? recordValue(parsed, "学习目标"));
      return objectives.length >= 3 ? objectives : ["理解核心概念", "掌握实践方法", "完成课程任务"];
    })(),
    chapters
  };
}

export function createFallbackOutline(input: GenerateCourseOutlineInput): GeneratedCourseOutline {
  const candidates = headingCandidates(input.documentText);
  const base = candidates.length ? candidates : [input.courseTitle];
  const chapterTitles = Array.from({ length: Math.max(3, Math.min(6, base.length)) }, (_, index) => {
    return base[index] || `${input.courseTitle} 第${index + 1}章`;
  });

  return {
    title: input.courseTitle,
    description: `根据上传文档自动生成的《${input.courseTitle}》课程目录。`,
    targetAudience: "本课程学习者",
    learningObjectives: ["理解核心概念", "掌握实践方法", "完成课程任务"],
    chapters: chapterTitles.map((title, chapterIndex) => ({
      title,
      summary: `围绕“${title}”展开学习与实践。`,
      order: chapterIndex + 1,
      lessons: [1, 2].map((lessonNumber) => ({
        title: `${title} ${lessonNumber === 1 ? "概念导入" : "实践应用"}`,
        summary: `学习${title}的${lessonNumber === 1 ? "基础内容" : "应用方法"}。`,
        order: lessonNumber,
        estimatedMinutes: 30,
        keyPoints: ["核心概念", "应用场景"],
        suggestedActivities: ["阅读材料并完成课堂讨论"],
        assessmentPrompts: ["请结合文档内容说明本节重点。"]
      }))
    }))
  };
}

export function parseOutlineOrFallback(raw: string, input: GenerateCourseOutlineInput): GenerateCourseOutlineResult {
  try {
    const parsed = JSON.parse(extractJsonText(raw)) as unknown;
    const direct = generatedCourseOutlineSchema.safeParse(parsed);
    if (direct.success) return { outline: direct.data };

    const normalized = normalizeLooseOutline(parsed, input);
    const normalizedResult = generatedCourseOutlineSchema.safeParse(normalized);
    if (normalizedResult.success) return { outline: normalizedResult.data };
  } catch {
    // Fall through to deterministic outline below.
  }
  return {
    outline: createFallbackOutline(input),
    warning: "模型输出无法解析或结构不符合课程目录格式，已使用本地确定性目录生成。"
  };
}

export async function generateCourseOutline(input: GenerateCourseOutlineInput): Promise<GenerateCourseOutlineResult> {
  const config = resolveAiModelConfig(input.model);
  if (!config) {
    return {
      outline: createFallbackOutline(input),
      warning:
        "未配置 AI_API_KEY/GEMINI_API_KEY/GOOGLE_API_KEY/OPENAI_API_KEY/apiKey/key，已使用本地确定性目录生成。修改 .env 后请重启服务并重试任务。"
    };
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

    return parseOutlineOrFallback(raw || "", input);
  } catch (error) {
    const safeMessage = safeAiErrorMessage(error);
    console.error("[ai] course outline generation failed:", safeMessage);
    return {
      outline: createFallbackOutline(input),
      warning: `大模型服务调用失败（${safeMessage}），已使用本地确定性目录生成。`
    };
  }
}
