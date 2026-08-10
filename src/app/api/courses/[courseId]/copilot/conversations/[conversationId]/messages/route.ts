import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { createTextCompletionStream } from "@/lib/ai/modelClient";
import { encodeAiStreamEvent } from "@/lib/ai/streamProtocol";
import { BoundedJsonBodyError, readBoundedJsonBody } from "@/lib/ai/requestGuards";
import { copilotRequestGuard } from "@/lib/ai/copilotRequestGuard";
import { requireUser } from "@/lib/auth";
import {
  completeCopilotTurn,
  CopilotError,
  failCopilotTurn,
  prepareCopilotTurn
} from "@/lib/courseWorkspace/copilot";

type RouteContext = { params: Promise<{ courseId: string; conversationId: string }> };

function jsonError(error: unknown) {
  if (error instanceof CopilotError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
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
      return Response.json({ code: "COPILOT_MESSAGE_BODY_TOO_LARGE", error: "AI智能体请求内容过大" }, { status: 413 });
    }
    return Response.json({ code: "COPILOT_MESSAGE_INVALID", error: "请输入有效问题" }, { status: 400 });
  }

  const lease = copilotRequestGuard.acquire(`${user.id}:${courseId}`);
  if (!lease.allowed) {
    return Response.json({ code: "MODEL_RATE_LIMITED", error: lease.reason === "concurrency" ? "上一条回复仍在生成" : "请求过于频繁，请稍后重试" }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(lease.retryAfterMs / 1_000))) }
    });
  }

  let turn: Awaited<ReturnType<typeof prepareCopilotTurn>>;
  try {
    turn = await prepareCopilotTurn({ user, courseId, conversationId, body });
  } catch (error) {
    lease.release();
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
      send({ type: "meta", conversationId: turn.conversationId, userMessageId: turn.userMessageId, citations: [] });
      try {
        const modelStream = await createTextCompletionStream({ system: turn.system, messages: turn.messages, signal: abortController.signal });
        if (!modelStream) throw new AiServiceError("MODEL_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员");
        let content = "";
        for await (const text of modelStream) {
          if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
          content += text;
          if (content.length > 100_000) throw new AiServiceError("MODEL_INVALID_OUTPUT", "AI 回复过长，请缩小问题范围");
          send({ type: "delta", text });
        }
        const assistantMessage = await completeCopilotTurn({
          conversationId: turn.conversationId,
          generationToken: turn.generationToken,
          usageEventId: turn.usageEventId,
          testRun: turn.testRun,
          content
        });
        send({ type: "done", assistantMessage });
      } catch (error) {
        const safe = error instanceof CopilotError ? error : toSafeAiError(error);
        await failCopilotTurn({
          conversationId: turn.conversationId,
          generationToken: turn.generationToken,
          usageEventId: turn.usageEventId,
          testRun: turn.testRun,
          errorCode: safe.code
        }).catch(() => undefined);
        send({ type: "error", code: safe.code, error: safe.message });
      } finally {
        request.signal.removeEventListener("abort", abort);
        lease.release();
        closed = true;
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
