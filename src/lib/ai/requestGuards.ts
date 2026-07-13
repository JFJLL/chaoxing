export type RequestGuardRejection = {
  allowed: false;
  reason: "concurrency" | "rate";
  retryAfterMs: number;
};

export type RequestGuardLease = {
  allowed: true;
  release: () => void;
};

type GuardEntry = {
  active: number;
  timestamps: number[];
};

export function createSlidingWindowConcurrencyGuard({
  limit,
  windowMs,
  maxConcurrent,
  now = Date.now
}: {
  limit: number;
  windowMs: number;
  maxConcurrent: number;
  now?: () => number;
}) {
  if (limit < 1 || windowMs < 1 || maxConcurrent < 1) {
    throw new Error("Request guard limits must be positive");
  }
  const entries = new Map<string, GuardEntry>();

  function acquire(key: string): RequestGuardLease | RequestGuardRejection {
    const currentTime = now();
    const entry = entries.get(key) ?? { active: 0, timestamps: [] };
    entry.timestamps = entry.timestamps.filter((timestamp) => currentTime - timestamp < windowMs);
    entries.set(key, entry);

    if (entry.active >= maxConcurrent) {
      return { allowed: false, reason: "concurrency", retryAfterMs: 1_000 };
    }
    if (entry.timestamps.length >= limit) {
      const retryAfterMs = Math.max(1, windowMs - (currentTime - entry.timestamps[0]!));
      return { allowed: false, reason: "rate", retryAfterMs };
    }

    entry.active += 1;
    entry.timestamps.push(currentTime);
    let released = false;
    return {
      allowed: true,
      release() {
        if (released) return;
        released = true;
        entry.active = Math.max(0, entry.active - 1);
      }
    };
  }

  return {
    acquire,
    reset() {
      entries.clear();
    }
  };
}

export class BoundedJsonBodyError extends Error {
  constructor(public readonly reason: "too_large" | "invalid") {
    super(reason === "too_large" ? "Request body is too large" : "Request body is invalid JSON");
    this.name = "BoundedJsonBodyError";
  }
}

export async function readBoundedJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive integer");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BoundedJsonBodyError("too_large");
  }
  if (!request.body) throw new BoundedJsonBodyError("invalid");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedJsonBodyError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BoundedJsonBodyError) throw error;
    throw new BoundedJsonBodyError("invalid");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new BoundedJsonBodyError("invalid");
  }
}
