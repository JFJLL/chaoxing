export type AiErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMITED"
  | "MODEL_INVALID_OUTPUT"
  | "MODEL_REQUEST_FAILED";

export class AiServiceError extends Error {
  constructor(public readonly code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiServiceError";
  }
}

function redact(value: string) {
  return value
    .replace(
      /((?:"|')?(?:api[_-]?key|apikey|x-api-key|x-goog-api-key|authorization)(?:"|')?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|Bearer\s+[^\s,;}\]]+|Basic\s+[^\s,;}\]]+|[^\s,;}\]]+)/gi,
      '$1"***"'
    )
    .replace(/([?&](?:key|api_key|apiKey|x-api-key|x-goog-api-key|authorization)=)[^&\s]+/gi, "$1***")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "***")
    .slice(0, 180);
}

export function toSafeAiError(error: unknown) {
  if (error instanceof AiServiceError) {
    return new AiServiceError(error.code, redact(error.message));
  }
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const name = error instanceof Error ? error.name : "";
  if (status === 429 || code === "RATE_LIMITED") {
    return new AiServiceError("MODEL_RATE_LIMITED", "AI 服务繁忙，请稍后重试");
  }
  if (
    status === 408
    || status === 504
    || /(?:ETIMEDOUT|TIMEOUT)/i.test(code)
    || /timeout/i.test(name)
  ) {
    return new AiServiceError("MODEL_TIMEOUT", "AI 调用超时，请重试");
  }
  return new AiServiceError(
    "MODEL_REQUEST_FAILED",
    `AI 服务调用失败：${redact(error instanceof Error ? error.message : "未知错误")}`
  );
}
