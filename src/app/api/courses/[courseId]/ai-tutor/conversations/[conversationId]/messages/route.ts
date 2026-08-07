import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createTextCompletionStream } from "@/lib/ai/modelClient";
import { encodeAiStreamEvent } from "@/lib/ai/streamProtocol";
import {
  BoundedJsonBodyError,
  readBoundedJsonBody
} from "@/lib/ai/requestGuards";
import { tutorRequestGuard } from "@/lib/ai/tutorRequestGuard";
import { requireUser } from "@/lib/auth";
import { requireCourseAccess } from "@/lib/permissions";
import {
  AiConversationError,
  completeTutorTurn,
  failTutorTurn,
  prepareTutorTurn,
  registerTutorGeneration,
  unregisterTutorGeneration
} from "@/lib/courseWorkspace/aiConversation";

type RouteContext = { params: Promise<{ courseId: string; conversationId: string }> };

function positiveEnvMs(name: string, fallbackMs: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallbackMs;
}

// A stalled upstream must never hold the conversation lease forever: the total
// deadline bounds the whole turn, and the idle watchdog aborts a stream that
// stops producing tokens (both release the lock through failTutorTurn).
const STREAM_TOTAL_TIMEOUT_MS = positiveEnvMs("AI_TUTOR_STREAM_TIMEOUT_MS", 180_000);
const STREAM_IDLE_TIMEOUT_MS = positiveEnvMs("AI_TUTOR_STREAM_IDLE_MS", 45_000);
const STREAM_WATCHDOG_INTERVAL_MS = 5_000;

function jsonError(error: unknown) {
  if (error instanceof AiConversationError) {
    return Response.json({ code: error.code, error: error.message }, { status: error.status });
  }
  const safe = toSafeAiError(error);
  const status = safe.code === "MODEL_RATE_LIMITED" ? 429
    : safe.code === "MODEL_TIMEOUT" ? 504
      : safe.code === "MODEL_NOT_CONFIGURED" ? 503
        : 502;
  return Response.json({ code: safe.code, error: safe.message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, conversationId } = await context.params;
  let body: unknown;
  try {
    body = await readBoundedJsonBody(request, 8_192);
  } catch (error) {
    if (error instanceof BoundedJsonBodyError && error.reason === "too_large") {
      return Response.json({ code: "AI_MESSAGE_BODY_TOO_LARGE", error: "AI 对话请求内容过大" }, { status: 413 });
    }
    return Response.json({ code: "AI_MESSAGE_INVALID", error: "请输入有效问题" }, { status: 400 });
  }

  try {
    await requireCourseAccess(user, courseId);
  } catch {
    return Response.json({ code: "COURSE_ACCESS_DENIED", error: "无权访问课程" }, { status: 403 });
  }

  const isRetryBody = typeof body === "object" && body !== null
    && "retryMessageId" in body
    && typeof (body as { retryMessageId?: unknown }).retryMessageId === "string";
  const requestLease = tutorRequestGuard.acquire(`${user.id}:${courseId}`);
  const preemptsConcurrentTurn = !requestLease.allowed
    && isRetryBody
    && "reason" in requestLease
    && requestLease.reason === "concurrency";
  if (!requestLease.allowed && !preemptsConcurrentTurn) {
    return Response.json({
      code: "MODEL_RATE_LIMITED",
      error: "AI 对话请求过于频繁，请稍后重试"
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(requestLease.retryAfterMs / 1_000))) }
    });
  }
  // A preemptive retry never acquired a lease (it replaces the previous turn);
  // every other path releases the real lease exactly once.
  const release = requestLease.allowed ? requestLease.release : () => undefined;

  const abortController = new AbortController();
  // Register before preparation so a concurrent retry can abort a previous
  // turn that is still building sources (slow extraction / downloads).
  registerTutorGeneration(conversationId, abortController);

  let turn: Awaited<ReturnType<typeof prepareTutorTurn>>;
  try {
    turn = await prepareTutorTurn({ user, courseId, conversationId, body, signal: abortController.signal });
  } catch (error) {
    unregisterTutorGeneration(conversationId, abortController);
    release();
    return jsonError(error);
  }

  const encoder = new TextEncoder();
  const abort = () => abortController.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  let closed = false;
  let timedOut = false;
  let lastActivityAt = Date.now();
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setInterval> | null = null;

  const startWatchdog = () => {
    deadlineTimer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, STREAM_TOTAL_TIMEOUT_MS);
    idleTimer = setInterval(() => {
      if (Date.now() - lastActivityAt > STREAM_IDLE_TIMEOUT_MS) {
        timedOut = true;
        abortController.abort();
      }
    }, STREAM_WATCHDOG_INTERVAL_MS);
  };
  const stopWatchdog = () => {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (idleTimer) clearInterval(idleTimer);
    deadlineTimer = null;
    idleTimer = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Parameters<typeof encodeAiStreamEvent>[0]) => {
        if (!closed) controller.enqueue(encoder.encode(encodeAiStreamEvent(event)));
      };
      send({
        type: "meta",
        conversationId: turn.conversationId,
        userMessageId: turn.userMessageId,
        citations: turn.citations
      });

      try {
        startWatchdog();
        const modelStream = await createTextCompletionStream({
          system: turn.system,
          messages: turn.messages,
          signal: abortController.signal
        });
        if (!modelStream) {
          throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员");
        }
        let content = "";
        for await (const text of modelStream) {
          if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
          content += text;
          lastActivityAt = Date.now();
          if (content.length > 100_000) {
            throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 返回内容过长，请重试");
          }
          if (text) send({ type: "delta", text });
        }
        if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const assistantMessage = await completeTutorTurn({
          userId: user.id,
          conversationId: turn.conversationId,
          generationToken: turn.generationToken,
          content,
          citations: turn.citations
        });
        send({ type: "done", assistantMessage });
      } catch (error) {
        await failTutorTurn(user.id, turn.conversationId, turn.generationToken);
        if (timedOut) {
          send({ type: "error", code: "MODEL_TIMEOUT", error: "AI 服务响应超时，请重试" });
        } else if (!abortController.signal.aborted) {
          const safe = error instanceof AiConversationError
            ? { code: error.code, message: error.message }
            : toSafeAiError(error);
          send({ type: "error", code: safe.code, error: safe.message });
        }
      } finally {
        stopWatchdog();
        unregisterTutorGeneration(turn.conversationId, abortController);
        release();
        request.signal.removeEventListener("abort", abort);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abortController.abort();
      stopWatchdog();
      unregisterTutorGeneration(conversationId, abortController);
      release();
      void failTutorTurn(user.id, turn.conversationId, turn.generationToken);
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
