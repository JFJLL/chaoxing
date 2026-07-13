import { describe, expect, it } from "vitest";
import { AiServiceError, toSafeAiError } from "@/lib/ai/errors";

describe("AI errors", () => {
  it("redacts bearer tokens and query keys", () => {
    const error = toSafeAiError(new Error("Bearer secret-token https://api.test?q=1&api_key=secret"));
    expect(error.message).not.toContain("secret-token");
    expect(error.message).not.toContain("api_key=secret");
  });

  it("redacts credentials from JSON bodies and provider headers", () => {
    const error = toSafeAiError(
      new Error(
        '{"apiKey":"secret-a","api_key":"secret-b","x-api-key":"secret-c","x-goog-api-key":"secret-d","authorization":"Bearer secret-e"}'
      )
    );

    for (const secret of ["secret-a", "secret-b", "secret-c", "secret-d", "secret-e"]) {
      expect(error.message).not.toContain(secret);
    }
  });

  it("redacts bare OpenAI-style secret tokens", () => {
    const error = toSafeAiError(new Error("provider rejected sk-proj-abcdef1234567890"));
    expect(error.message).not.toContain("sk-proj-abcdef1234567890");
    expect(error.message).toContain("***");
  });

  it("re-sanitizes an existing service error while preserving its code", () => {
    const input = new AiServiceError("MODEL_TIMEOUT", "authorization: Bearer private-token");
    const safe = toSafeAiError(input);

    expect(safe).not.toBe(input);
    expect(safe.code).toBe("MODEL_TIMEOUT");
    expect(safe.message).not.toContain("private-token");
  });

  it("limits provider error bodies exposed to callers", () => {
    const safe = toSafeAiError(new Error(`provider body: ${"x".repeat(1000)}`));
    expect(safe.message.length).toBeLessThanOrEqual(180 + "AI 服务调用失败：".length);
  });

  it("maps provider rate limits to a stable retryable error", () => {
    const safe = toSafeAiError(Object.assign(new Error("provider body with private details"), { status: 429 }));

    expect(safe).toMatchObject({
      code: "MODEL_RATE_LIMITED",
      message: "AI 服务繁忙，请稍后重试"
    });
  });

  it("maps provider timeouts without exposing provider diagnostics", () => {
    const safe = toSafeAiError(Object.assign(new Error("socket ETIMEDOUT private-host"), { code: "ETIMEDOUT" }));

    expect(safe).toMatchObject({
      code: "MODEL_TIMEOUT",
      message: "AI 调用超时，请重试"
    });
  });
});
