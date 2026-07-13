import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createJsonCompletion } from "@/lib/ai/modelClient";
import {
  acquireCoachModelRequest,
  AiCoachContractError,
  MAX_COACH_MESSAGES,
  MAX_COACH_TRANSCRIPT_CHARS,
  buildCoachEvaluationPrompt,
  coachTranscriptSize,
  parseCoachEvaluation,
  parseStoredCoachRubric,
  type AiCoachTaskConfig,
  type AiCoachTranscriptMessage
} from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string; attemptId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, attemptId } = await context.params;
  await requireCourseAccess(user, courseId);
  const declaredLength = Number(_request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) {
    return NextResponse.json({ code: "AI_REQUEST_TOO_LARGE", error: "请求内容过大" }, { status: 413 });
  }
  const attempt = await db.courseAiConversation.findFirst({
    where: { id: attemptId, courseId, kind: "COACH", userId: user.id },
    include: { coachTask: true }
  });
  if (!attempt?.coachTask) {
    return NextResponse.json({ code: "AI_COACH_ATTEMPT_NOT_FOUND", error: "陪练记录不存在" }, { status: 404 });
  }
  const messages = await db.courseAiMessage.findMany({
    where: { conversationId: attemptId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_COACH_MESSAGES + 1,
    select: { id: true, role: true, content: true, createdAt: true }
  });
  if (messages.length > MAX_COACH_MESSAGES || coachTranscriptSize(messages) > MAX_COACH_TRANSCRIPT_CHARS) {
    return NextResponse.json({ code: "AI_COACH_TRANSCRIPT_TOO_LARGE", error: "陪练对话超过评价上限" }, { status: 413 });
  }
  if (!messages.some((message) => message.role === "USER") || !messages.some((message) => message.role === "ASSISTANT") || messages.at(-1)?.role !== "ASSISTANT") {
    return NextResponse.json({ code: "AI_COACH_TRANSCRIPT_INCOMPLETE", error: "至少完成一轮完整对话后才能评价" }, { status: 409 });
  }
  let rubricDimensions: ReturnType<typeof parseStoredCoachRubric>;
  let task: AiCoachTaskConfig;
  try {
    rubricDimensions = parseStoredCoachRubric(attempt.coachTask.rubric);
    task = {
      title: attempt.coachTask.title,
      scenario: attempt.coachTask.scenario,
      aiRole: attempt.coachTask.aiRole,
      objective: attempt.coachTask.objective,
      rubricDimensions,
      completionCriteria: attempt.coachTask.completionCriteria
    };
  } catch {
    return NextResponse.json({
      code: "AI_COACH_TASK_INVALID",
      error: "陪练任务配置已损坏，请联系教师重新发布"
    }, { status: 409 });
  }
  const transcript: AiCoachTranscriptMessage[] = messages.map((message) => ({
    role: message.role === "ASSISTANT" ? "ASSISTANT" : "USER",
    content: message.content
  }));
  const modelLease = acquireCoachModelRequest(user.id, courseId);
  if (!modelLease.allowed) {
    return NextResponse.json({ code: "MODEL_RATE_LIMITED", error: "AI 请求过于频繁，请稍后重试", retryAfterMs: modelLease.retryAfterMs }, { status: 429 });
  }
  const generationToken = randomUUID();
  try {
    const claimed = await db.courseAiConversation.updateMany({
      where: {
        id: attemptId,
        courseId,
        userId: user.id,
        kind: "COACH",
        status: "ACTIVE",
        evaluationStatus: { in: ["PENDING", "FAILED"] }
      },
      data: { status: "EVALUATING", evaluationStatus: "GENERATING", evaluation: null, generationToken }
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ code: "AI_COACH_EVALUATION_BUSY", error: "评价正在生成或已经完成" }, { status: 409 });
    }
    const raw = await createJsonCompletion({
      system: "你是严格的教学陪练评价器，只能依据教师量规和完整对话评分。",
      user: buildCoachEvaluationPrompt(task, transcript)
    });
    if (!raw) throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请联系管理员完成配置");
    const evaluation = parseCoachEvaluation(raw, rubricDimensions, transcript);
    const completedAt = new Date();
    const completed = await db.courseAiConversation.updateMany({
      where: { id: attemptId, status: "EVALUATING", evaluationStatus: "GENERATING", generationToken },
      data: {
        status: "COMPLETED",
        evaluationStatus: "COMPLETED",
        evaluation: JSON.stringify(evaluation),
        generationToken: null,
        completedAt
      }
    });
    if (completed.count !== 1) throw new Error("AI coach evaluation lease expired");
    return NextResponse.json({ evaluation, completedAt });
  } catch (error) {
    await db.courseAiConversation.updateMany({
      where: { id: attemptId, status: "EVALUATING", evaluationStatus: "GENERATING", generationToken },
      data: { status: "ACTIVE", evaluationStatus: "FAILED", evaluation: null, generationToken: null }
    }).catch(() => undefined);
    const safe = toSafeAiError(error instanceof AiCoachContractError
      ? new AiServiceError("MODEL_INVALID_OUTPUT", error.message)
      : error instanceof AiServiceError
        ? error
        : new AiServiceError("MODEL_REQUEST_FAILED", error instanceof Error ? error.message : "AI 调用失败，请重试"));
    return NextResponse.json({ code: safe.code, error: safe.message, retryable: true }, {
      status: safe.code === "MODEL_NOT_CONFIGURED" ? 503 : 502
    });
  } finally {
    modelLease.release();
  }
}
