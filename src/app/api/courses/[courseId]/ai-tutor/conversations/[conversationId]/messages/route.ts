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
  prepareTutorTurn
} from "@/lib/courseWorkspace/aiConversation";

type RouteContext = { params: Promise<{ courseId: string; conversationId: string }> };

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

  const requestLease = tutorRequestGuard.acquire(`${user.id}:${courseId}`);
  if (!requestLease.allowed) {
    return Response.json({
      code: "MODEL_RATE_LIMITED",
      error: "AI 对话请求过于频繁，请稍后重试"
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(requestLease.retryAfterMs / 1_000))) }
    });
  }

  let turn: Awaited<ReturnType<typeof prepareTutorTurn>>;
  try {
    turn = await prepareTutorTurn({ user, courseId, conversationId, body });
  } catch (error) {
    requestLease.release();
    return jsonError(error);
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  let closed = false;

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
        if (!abortController.signal.aborted) {
          const safe = error instanceof AiConversationError
            ? { code: error.code, message: error.message }
            : toSafeAiError(error);
          send({ type: "error", code: safe.code, error: safe.message });
        }
      } finally {
        requestLease.release();
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
      requestLease.release();
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
