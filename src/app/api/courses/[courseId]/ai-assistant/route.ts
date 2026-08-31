import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";
import { BoundedJsonBodyError, readBoundedJsonBody } from "@/lib/ai/requestGuards";
import { tutorRequestGuard } from "@/lib/ai/tutorRequestGuard";
import { requireUser } from "@/lib/auth";
import {
  aiAssistantActionSchema,
  runAiAssistantAction
} from "@/lib/courseWorkspace/aiAssistantActions";
import { requireCourseAccess } from "@/lib/permissions";

type RouteContext = { params: Promise<{ courseId: string }> };

function timeoutMs() {
  const value = Number(process.env.AI_ASSISTANT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 90_000;
}

function errorResponse(error: unknown) {
  const safe = error instanceof AiServiceError ? error : toSafeAiError(error);
  const status = safe.code === "MODEL_RATE_LIMITED" ? 429
    : safe.code === "MODEL_TIMEOUT" ? 504
      : safe.code === "MODEL_NOT_CONFIGURED" ? 503
        : 502;
  console.error(`[ai-assistant] ${safe.code}`, safe.message);
  return Response.json({ code: safe.code, error: safe.message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  let body: unknown;
  try {
    body = await readBoundedJsonBody(request, 32_768);
  } catch (error) {
    const tooLarge = error instanceof BoundedJsonBodyError && error.reason === "too_large";
    return Response.json({
      code: tooLarge ? "AI_ASSISTANT_BODY_TOO_LARGE" : "AI_ASSISTANT_INPUT_INVALID",
      error: tooLarge ? "提交内容过大，请缩短后重试" : "请求内容无效"
    }, { status: tooLarge ? 413 : 400 });
  }

  const parsed = aiAssistantActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: "AI_ASSISTANT_INPUT_INVALID", error: "提交内容不完整或超出长度限制" }, { status: 400 });
  }

  let course: Awaited<ReturnType<typeof requireCourseAccess>>;
  try {
    course = await requireCourseAccess(user, courseId);
  } catch {
    return Response.json({ code: "COURSE_ACCESS_DENIED", error: "无权访问课程" }, { status: 403 });
  }

  const lease = tutorRequestGuard.acquire(`${user.id}:${courseId}`);
  if (!lease.allowed) {
    return Response.json({ code: "MODEL_RATE_LIMITED", error: "AI 请求过于频繁，请稍后重试" }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(lease.retryAfterMs / 1_000))) }
    });
  }

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const hardTimeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      reject(new AiServiceError("MODEL_TIMEOUT", "AI 调用超时，请重试"));
    }, timeoutMs());
  });
  try {
    const result = await Promise.race([
      runAiAssistantAction({
        action: parsed.data,
        courseId,
        courseTitle: course.title,
        user,
        signal: abortController.signal
      }),
      hardTimeout
    ]);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (timedOut) {
      return errorResponse(new AiServiceError("MODEL_TIMEOUT", "AI 调用超时，请重试"));
    }
    return errorResponse(error);
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    lease.release();
  }
}
