import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseAccess } from "@/lib/permissions";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createTextCompletionStream } from "@/lib/ai/modelClient";
import { encodeAiStreamEvent } from "@/lib/ai/streamProtocol";
import { BoundedJsonBodyError, readBoundedJsonBody } from "@/lib/ai/requestGuards";
import {
  MAX_COACH_ASSISTANT_CHARS,
  MAX_COACH_MESSAGES,
  MAX_COACH_TRANSCRIPT_CHARS,
  acquireCoachModelRequest,
  buildCoachRoleplayPrompt,
  coachTranscriptSize,
  parseStoredCoachRubric,
  type AiCoachTaskConfig,
  type AiCoachTranscriptMessage
} from "@/lib/courseWorkspace/aiCoach";

type RouteContext = { params: Promise<{ courseId: string; attemptId: string }> };

const requestSchema = z.union([
  z.object({ message: z.string().trim().min(1).max(4_000), requestId: z.string().uuid() }).strict(),
  z.object({ retryMessageId: z.string().trim().min(1).max(200) }).strict()
]);

function taskConfig(task: {
  title: string;
  scenario: string;
  aiRole: string;
  objective: string;
  rubric: string;
  completionCriteria: string;
}): AiCoachTaskConfig {
  return {
    title: task.title,
    scenario: task.scenario,
    aiRole: task.aiRole,
    objective: task.objective,
    rubricDimensions: parseStoredCoachRubric(task.rubric),
    completionCriteria: task.completionCriteria
  };
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, attemptId } = await context.params;
  await requireCourseAccess(user, courseId);
  let requestBody: unknown;
  try {
    requestBody = await readBoundedJsonBody(request, 8_192);
  } catch (error) {
    const tooLarge = error instanceof BoundedJsonBodyError && error.reason === "too_large";
    return NextResponse.json({ code: tooLarge ? "AI_REQUEST_TOO_LARGE" : "AI_COACH_MESSAGE_INVALID", error: tooLarge ? "请求内容过大" : "陪练消息无效" }, { status: tooLarge ? 413 : 400 });
  }
  const parsed = requestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json({ code: "AI_COACH_MESSAGE_INVALID", error: "陪练消息无效" }, { status: 400 });
  }
  const retryMessageId = "retryMessageId" in parsed.data ? parsed.data.retryMessageId : null;
  const submittedMessage = "message" in parsed.data ? parsed.data.message : null;
  const requestId = "requestId" in parsed.data ? parsed.data.requestId : null;

  const attempt = await db.courseAiConversation.findFirst({
    where: { id: attemptId, courseId, kind: "COACH", userId: user.id },
    include: { coachTask: true }
  });
  if (!attempt?.coachTask) {
    return NextResponse.json({ code: "AI_COACH_ATTEMPT_NOT_FOUND", error: "陪练记录不存在" }, { status: 404 });
  }
  let config: AiCoachTaskConfig;
  try {
    config = taskConfig(attempt.coachTask);
  } catch {
    return NextResponse.json({ code: "AI_COACH_TASK_INVALID", error: "陪练任务配置已损坏，请联系教师重新发布" }, { status: 409 });
  }

  const existing = await db.courseAiMessage.findMany({
    where: { conversationId: attemptId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_COACH_MESSAGES + 1,
    select: { id: true, role: true, content: true, createdAt: true }
  });
  const idempotentMessage = requestId ? existing.find((message) => message.id === requestId) : null;
  if (idempotentMessage && (idempotentMessage.role !== "USER" || idempotentMessage.content !== submittedMessage)) {
    return NextResponse.json({ code: "AI_COACH_REQUEST_CONFLICT", error: "消息请求标识已被其他内容使用" }, { status: 409 });
  }
  const effectiveRetryId = retryMessageId ?? idempotentMessage?.id ?? null;
  const retry = effectiveRetryId !== null;
  const retryMessage = retry ? existing.find((message) => message.id === effectiveRetryId) : null;
  if (!retry && existing.at(-1)?.role === "USER") {
    return NextResponse.json({
      code: "AI_COACH_RETRY_REQUIRED",
      error: "上一轮 AI 回复未完成，请先重试该轮对话"
    }, { status: 409 });
  }
  if (retry && (retryMessage?.role !== "USER" || existing.at(-1)?.id !== retryMessage.id)) {
    return NextResponse.json({ code: "AI_COACH_RETRY_INVALID", error: "只能重试最后一条未完成的学生消息" }, { status: 409 });
  }

  const modelLease = acquireCoachModelRequest(user.id, courseId);
  if (!modelLease.allowed) {
    return NextResponse.json({ code: "MODEL_RATE_LIMITED", error: "AI 请求过于频繁，请稍后重试", retryAfterMs: modelLease.retryAfterMs }, { status: 429 });
  }

  const generationToken = randomUUID();
  const invalidateGenerationLease = () => db.courseAiConversation.updateMany({
    where: { id: attemptId, status: "GENERATING", generationToken },
    data: { status: "ACTIVE", generationToken: null }
  });
  try {
    const claimed = await db.courseAiConversation.updateMany({
      where: { id: attemptId, courseId, userId: user.id, kind: "COACH", status: "ACTIVE" },
      data: { status: "GENERATING", generationToken }
    });
    if (claimed.count !== 1) {
      modelLease.release();
      return NextResponse.json({ code: "AI_COACH_ATTEMPT_BUSY", error: "当前陪练正在生成或已经完成" }, { status: 409 });
    }

    const leasedMessages = await db.courseAiMessage.findMany({
      where: { conversationId: attemptId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_COACH_MESSAGES + 1,
      select: { id: true, role: true, content: true, createdAt: true }
    });
    const leasedRetryMessage = retry ? leasedMessages.find((message) => message.id === effectiveRetryId) : null;
    const newUserChars = retry ? 0 : submittedMessage!.length;
    const reservedMessages = leasedMessages.length + (retry ? 1 : 2);
    if (reservedMessages > MAX_COACH_MESSAGES || coachTranscriptSize(leasedMessages) + newUserChars > MAX_COACH_TRANSCRIPT_CHARS) {
      await invalidateGenerationLease();
      modelLease.release();
      return NextResponse.json({ code: "AI_COACH_TRANSCRIPT_TOO_LARGE", error: "陪练对话已达到长度上限，请结束并生成评价" }, { status: 413 });
    }

    let userMessage = leasedRetryMessage;
    if (!retry) {
      userMessage = await db.courseAiMessage.create({
        data: { id: requestId!, conversationId: attemptId, role: "USER", content: submittedMessage! },
        select: { id: true, role: true, content: true, createdAt: true }
      });
    }
    if (!userMessage) {
      await invalidateGenerationLease();
      modelLease.release();
      return NextResponse.json({ code: "AI_COACH_RETRY_INVALID", error: "重试消息不存在" }, { status: 409 });
    }

    const transcript: AiCoachTranscriptMessage[] = (retry ? leasedMessages : [...leasedMessages, userMessage]).map((message) => ({
      role: message.role === "ASSISTANT" ? "ASSISTANT" : "USER",
      content: message.content
    }));
    const encoder = new TextEncoder();
    const localAbort = new AbortController();
    let invalidation: Promise<unknown> | null = null;
    const invalidateOnce = () => {
      invalidation ??= invalidateGenerationLease().catch(() => undefined);
      return invalidation;
    };
    const abortAfterInvalidation = () => {
      void invalidateOnce().finally(() => localAbort.abort());
    };
    if (request.signal.aborted) abortAfterInvalidation();
    else request.signal.addEventListener("abort", abortAfterInvalidation, { once: true });
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: Parameters<typeof encodeAiStreamEvent>[0]) => {
          controller.enqueue(encoder.encode(encodeAiStreamEvent(event)));
        };
        void (async () => {
          try {
            if (request.signal.aborted) {
              await invalidateOnce();
              localAbort.abort();
              throw new DOMException("Aborted", "AbortError");
            }
            send({ type: "meta", conversationId: attemptId, userMessageId: userMessage!.id, citations: [] });
            const stream = await createTextCompletionStream({
              system: buildCoachRoleplayPrompt(config, []),
              messages: transcript.map((message) => ({
                role: message.role === "ASSISTANT" ? "assistant" : "user",
                content: message.content
              })),
              signal: localAbort.signal
            });
            if (!stream) throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型未配置，请联系管理员完成配置");
            let content = "";
            for await (const text of stream) {
              if (localAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");
              content += text;
              if (content.length > MAX_COACH_ASSISTANT_CHARS || coachTranscriptSize(transcript) + content.length > MAX_COACH_TRANSCRIPT_CHARS) {
                throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回内容过长，请重试");
              }
              send({ type: "delta", text });
            }
            if (!content.trim()) throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 未返回有效内容，请重试");
            if (localAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");
            const assistant = await db.$transaction(async (transaction) => {
              if (localAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");
              const completed = await transaction.courseAiConversation.updateMany({
                where: { id: attemptId, status: "GENERATING", generationToken },
                data: { status: "ACTIVE", generationToken: null }
              });
              if (completed.count !== 1) throw new Error("AI coach generation lease expired");
              return transaction.courseAiMessage.create({
                data: { conversationId: attemptId, role: "ASSISTANT", content },
                select: { id: true, role: true, content: true, createdAt: true }
              });
            });
            send({
              type: "done",
              assistantMessage: {
                id: assistant.id,
                role: "assistant",
                content: assistant.content,
                citations: [],
                createdAt: assistant.createdAt.toISOString()
              }
            });
          } catch (error) {
            await invalidateGenerationLease().catch(() => undefined);
            const safe = toSafeAiError(error);
            try {
              send({ type: "error", code: safe.code, error: safe.message });
            } catch {
              // The client stopped reading; a reply that already crossed the transaction boundary appears after refresh.
            }
          } finally {
            modelLease.release();
            try { controller.close(); } catch { /* already closed by the client */ }
          }
        })();
      },
      async cancel() {
        try {
          await invalidateOnce();
        } finally {
          localAbort.abort();
        }
      }
    });

    return new Response(responseStream, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (error) {
    await db.courseAiConversation.updateMany({
      where: { id: attemptId, status: "GENERATING", generationToken },
      data: { status: "ACTIVE", generationToken: null }
    }).catch(() => undefined);
    modelLease.release();
    const safe = toSafeAiError(error);
    return NextResponse.json({ code: safe.code, error: safe.message, retryable: true }, { status: 502 });
  }
}
