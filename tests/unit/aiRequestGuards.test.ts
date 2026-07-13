import { describe, expect, it } from "vitest";
import {
  createSlidingWindowConcurrencyGuard,
  readBoundedJsonBody,
  BoundedJsonBodyError
} from "../../src/lib/ai/requestGuards";

describe("sliding-window concurrency guard", () => {
  it("allows only one active request for the same key and releases it explicitly", () => {
    const guard = createSlidingWindowConcurrencyGuard({ limit: 10, windowMs: 60_000, maxConcurrent: 1 });

    const first = guard.acquire("user-1:course-1");
    expect(first.allowed).toBe(true);
    expect(guard.acquire("user-1:course-1")).toMatchObject({ allowed: false, reason: "concurrency" });
    if (first.allowed) first.release();
    expect(guard.acquire("user-1:course-1").allowed).toBe(true);
  });

  it("uses a true sliding window and exposes reset for deterministic tests", () => {
    let now = 1_000;
    const guard = createSlidingWindowConcurrencyGuard({
      limit: 2,
      windowMs: 60_000,
      maxConcurrent: 1,
      now: () => now
    });

    const first = guard.acquire("key");
    if (first.allowed) first.release();
    now = 30_000;
    const second = guard.acquire("key");
    if (second.allowed) second.release();
    expect(guard.acquire("key")).toMatchObject({ allowed: false, reason: "rate" });

    now = 61_001;
    expect(guard.acquire("key").allowed).toBe(true);
    guard.reset();
    expect(guard.acquire("key").allowed).toBe(true);
  });
});

describe("readBoundedJsonBody", () => {
  it("counts streamed bytes rather than trusting Content-Length", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`{"query":"${"a".repeat(4_200)}"}`));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedJsonBody(request, 4_096)).rejects.toBeInstanceOf(BoundedJsonBodyError);
    await expect(readBoundedJsonBody(new Request("http://localhost", {
      method: "POST",
      body: "not-json"
    }), 4_096)).rejects.toMatchObject({ reason: "invalid" });
  });
});
