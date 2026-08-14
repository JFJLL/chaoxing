import { ZoviiClient } from "./client";
import { sendCodeLimit, type SendCodeLimit } from "./rateLimit";

export function sendCodeRateLimitMessage(limit: SendCodeLimit): string | null {
  if (limit.allowed) return null;
  return limit.hourly
    ? "发送过于频繁，请 1 小时后再试"
    : `发送过于频繁，请 ${limit.retryAfterSeconds} 秒后重试`;
}

/**
 * Shared send-code gate: applies the cooldown + hourly caps, then forwards to
 * Zovii with the given purpose. The caller maps rate-limit failures to its own
 * domain error type via `raiseRateLimited`.
 */
export async function sendPlatformCode(
  phone: string,
  purpose: "register" | "login",
  bucket: "register" | "link",
  client: ZoviiClient,
  raiseRateLimited: (message: string) => never
): Promise<{ retryAfterSeconds: number }> {
  const limit = sendCodeLimit(phone, bucket);
  const message = sendCodeRateLimitMessage(limit);
  if (message) {
    raiseRateLimited(message);
  }
  await client.sendCode(phone, purpose);
  return { retryAfterSeconds: 0 };
}
