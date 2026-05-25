import OpenAI from "openai";
import type { GeneratedCourseOutline } from "@/types/course";
import { generatedCourseOutlineSchema } from "@/lib/ai/courseOutlineSchema";
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
    const parsed = JSON.parse(raw) as unknown;
    return { outline: generatedCourseOutlineSchema.parse(parsed) };
  } catch {
    return {
      outline: createFallbackOutline(input),
      warning: "模型输出无法解析，已使用本地确定性目录生成。"
    };
  }
}

export async function generateCourseOutline(input: GenerateCourseOutlineInput): Promise<GenerateCourseOutlineResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      outline: createFallbackOutline(input),
      warning: "未配置 OPENAI_API_KEY，已使用本地确定性目录生成。"
    };
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    });
    const completion = await client.chat.completions.create({
      model: input.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "你只输出符合约束的 JSON 对象。"
        },
        {
          role: "user",
          content: buildCourseOutlinePrompt({
            courseTitle: input.courseTitle,
            documentText: input.chunks[0] || input.documentText
          })
        }
      ],
      response_format: { type: "json_object" }
    });

    return parseOutlineOrFallback(completion.choices[0]?.message.content || "", input);
  } catch {
    return {
      outline: createFallbackOutline(input),
      warning: "大模型服务调用失败，已使用本地确定性目录生成。"
    };
  }
}
