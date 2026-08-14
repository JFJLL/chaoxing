import { describe, expect, it } from "vitest";
import { checkRateLimit, clearRateLimits } from "../../src/lib/zovii/rateLimit";

describe("send-code rate limiting", () => {
  it("allows the first request and blocks the second within the window", () => {
    clearRateLimits();
    let now = 1_000_000;
    expect(checkRateLimit("phone-1", { now: () => now })).toEqual({ allowed: true, retryAfterSeconds: 0 });
    const second = checkRateLimit("phone-1", { now: () => now });
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows again after the window resets", () => {
    clearRateLimits();
    let now = 1_000_000;
    checkRateLimit("phone-1", { now: () => now, windowMs: 60_000 });
    now += 60_001;
    expect(checkRateLimit("phone-1", { now: () => now }).allowed).toBe(true);
  });

  it("enforces a long-window hourly cap independently of the cooldown", () => {
    clearRateLimits();
    let now = 1_000_000;
    const hourly = { now: () => now, windowMs: 3_600_000, max: 3 };
    expect(checkRateLimit("phone-2:hourly", hourly).allowed).toBe(true);
    expect(checkRateLimit("phone-2:hourly", hourly).allowed).toBe(true);
    expect(checkRateLimit("phone-2:hourly", hourly).allowed).toBe(true);
    const blocked = checkRateLimit("phone-2:hourly", hourly);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    now += 3_600_001;
    expect(checkRateLimit("phone-2:hourly", hourly).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    clearRateLimits();
    checkRateLimit("phone-a");
    expect(checkRateLimit("phone-b").allowed).toBe(true);
  });
});
