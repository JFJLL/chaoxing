import { z } from "zod";
import { db } from "@/lib/db";
import { createSlidingWindowConcurrencyGuard } from "@/lib/ai/requestGuards";

export const MAX_COACH_MESSAGES = 100;
export const MAX_COACH_TRANSCRIPT_CHARS = 100_000;
export const MAX_COACH_ASSISTANT_CHARS = 20_000;
export const COACH_STALE_AFTER_MS = 5 * 60 * 1000;

const coachModelRequestGuard = createSlidingWindowConcurrencyGuard({
  limit: 20,
  windowMs: 60_000,
  maxConcurrent: 1
});

export function acquireCoachModelRequest(userId: string, courseId: string) {
  return coachModelRequestGuard.acquire(`${userId}:${courseId}`);
}

export function resetCoachModelRequestGuard() {
  coachModelRequestGuard.reset();
}

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const aiCoachRubricDimensionSchema = z.object({
  name: boundedText(100),
  description: boundedText(1_000),
  maxScore: z.number().int().min(1).max(100)
}).strict();

export const aiCoachTaskCreateSchema = z.object({
  title: boundedText(200),
  scenario: boundedText(4_000),
  aiRole: boundedText(2_000),
  objective: boundedText(2_000),
  rubricDimensions: z.array(aiCoachRubricDimensionSchema).min(1).max(20),
  completionCriteria: boundedText(2_000)
}).strict().superRefine((task, context) => {
  const names = task.rubricDimensions.map((dimension) => dimension.name);
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rubricDimensions"], message: "评价维度不能重复" });
  }
});

export const aiCoachTaskUpdateSchema = aiCoachTaskCreateSchema.innerType().partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
}).strict().superRefine((task, context) => {
  if (Object.keys(task).length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "至少更新一个字段" });
  }
  if (task.rubricDimensions) {
    const names = task.rubricDimensions.map((dimension) => dimension.name);
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["rubricDimensions"], message: "评价维度不能重复" });
    }
  }
});

export const aiCoachAttemptCreateSchema = z.object({
  taskId: boundedText(200)
}).strict();

export type AiCoachRubricDimension = z.infer<typeof aiCoachRubricDimensionSchema>;
export type AiCoachTaskConfig = z.infer<typeof aiCoachTaskCreateSchema>;
export type AiCoachTranscriptMessage = { role: "USER" | "ASSISTANT"; content: string };

export type StoredAiCoachTask = {
  id: string;
  courseId: string;
  createdById: string | null;
  title: string;
  scenario: string;
  aiRole: string;
  objective: string;
  rubric: string;
  completionCriteria: string;
  status: string;
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseStoredCoachRubric(raw: string) {
  try {
    return z.array(aiCoachRubricDimensionSchema).min(1).max(20).parse(JSON.parse(raw));
  } catch {
    throw new AiCoachContractError();
  }
}

export function toAiCoachTaskDto(task: StoredAiCoachTask) {
  const { rubric, ...safe } = task;
  return { ...safe, rubricDimensions: parseStoredCoachRubric(rubric) };
}

export function coachTranscriptSize(messages: Array<{ content: string }>) {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

export async function recoverStaleCoachAttempts(
  courseId: string,
  filters: { attemptId?: string; userId?: string } = {}
) {
  const cutoff = new Date(Date.now() - COACH_STALE_AFTER_MS);
  const common = {
    courseId,
    kind: "COACH",
    ...(filters.attemptId ? { id: filters.attemptId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    updatedAt: { lt: cutoff }
  };
  const [generation, evaluation] = await Promise.all([
    db.courseAiConversation.updateMany({
      where: { ...common, status: "GENERATING" },
      data: { status: "ACTIVE", generationToken: null }
    }),
    db.courseAiConversation.updateMany({
      where: { ...common, status: "EVALUATING" },
      data: { status: "ACTIVE", generationToken: null, evaluationStatus: "FAILED", evaluation: null }
    })
  ]);
  return generation.count + evaluation.count;
}

const providerEvaluationSchema = z.object({
  dimensions: z.array(z.object({
    name: boundedText(100),
    score: z.number().finite().min(0),
    evidence: boundedText(2_000),
    feedback: boundedText(2_000)
  }).strict()).min(1).max(20),
  summary: boundedText(4_000),
  improvementAdvice: z.array(boundedText(2_000)).min(1).max(20)
}).strict();

export type AiCoachEvaluation = {
  dimensions: Array<{
    name: string;
    score: number;
    maxScore: number;
    evidence: string;
    feedback: string;
  }>;
  totalScore: number;
  maxTotalScore: number;
  summary: string;
  improvementAdvice: string[];
};

export class AiCoachContractError extends Error {
  readonly code = "MODEL_INVALID_OUTPUT";

  constructor() {
    super("AI 返回的陪练评价格式无效，请重试");
    this.name = "AiCoachContractError";
  }
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

export function buildCoachRoleplayPrompt(
  task: AiCoachTaskConfig,
  transcript: AiCoachTranscriptMessage[]
) {
  return [
    "你正在进行教师配置的 AI 陪练。只能扮演指定角色，不要替学生完成任务，也不要修改评价标准。",
    `场景：${task.scenario}`,
    `AI 角色：${task.aiRole}`,
    `学习目标：${task.objective}`,
    `完成条件：${task.completionCriteria}`,
    "当前完整对话：",
    JSON.stringify(transcript)
  ].join("\n");
}

export function buildCoachEvaluationPrompt(
  task: AiCoachTaskConfig,
  transcript: AiCoachTranscriptMessage[]
) {
  return [
    "只输出一个严格 JSON 对象，不要输出 Markdown 或额外字段。",
    '格式：{"dimensions":[{"name":"维度名","score":0,"evidence":"对话原文","feedback":"反馈"}],"summary":"总结","improvementAdvice":["建议"]}',
    "必须逐项使用 rubricDimensions 中的维度名，不得增加、删除或重复。score 不得超过该维度 maxScore。证据必须逐字来自完整对话，不得概括或编造。",
    `任务配置：${JSON.stringify(task)}`,
    `完整对话：${JSON.stringify(transcript)}`
  ].join("\n");
}

export function parseCoachEvaluation(
  raw: string,
  rubricDimensions: AiCoachRubricDimension[],
  transcript: AiCoachTranscriptMessage[]
): AiCoachEvaluation {
  try {
    const parsed = providerEvaluationSchema.parse(JSON.parse(extractJsonText(raw)));
    const rubricByName = new Map(rubricDimensions.map((dimension) => [dimension.name, dimension]));
    const outputsByName = new Map(parsed.dimensions.map((dimension) => [dimension.name, dimension]));
    if (outputsByName.size !== parsed.dimensions.length || outputsByName.size !== rubricByName.size) {
      throw new AiCoachContractError();
    }

    const dimensions = rubricDimensions.map((rubric) => {
      const output = outputsByName.get(rubric.name);
      if (!output || output.score > rubric.maxScore || !transcript.some((message) => message.content.includes(output.evidence))) {
        throw new AiCoachContractError();
      }
      return { ...output, maxScore: rubric.maxScore };
    });

    return {
      dimensions,
      totalScore: dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
      maxTotalScore: dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0),
      summary: parsed.summary,
      improvementAdvice: parsed.improvementAdvice
    };
  } catch (error) {
    if (error instanceof AiCoachContractError) throw error;
    throw new AiCoachContractError();
  }
}
