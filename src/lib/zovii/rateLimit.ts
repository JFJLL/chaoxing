type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  now?: () => number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type SendCodeLimit =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; hourly: boolean };

/**
 * Combined cooldown + hourly cap for one send-code destination. The caller maps
 * the outcome to its own domain error type.
 */
export function sendCodeLimit(phone: string, prefix: "register" | "link"): SendCodeLimit {
  const cooldown = checkRateLimit(`${prefix}-code:${phone}`, { windowMs: 60_000, max: 1 });
  if (!cooldown.allowed) {
    return { allowed: false, retryAfterSeconds: cooldown.retryAfterSeconds, hourly: false };
  }
  const hourly = checkRateLimit(`${prefix}-code-hour:${phone}`, { windowMs: 3_600_000, max: 5 });
  if (!hourly.allowed) {
    return { allowed: false, retryAfterSeconds: hourly.retryAfterSeconds, hourly: true };
  }
  return { allowed: true };
}

/**
 * In-memory fixed-window rate limiter. Single-instance only; deployed
 * multi-instance setups should move this to a shared store.
 */
export function checkRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 1;
  const now = options.now ?? Date.now;
  const current = now();

  if (buckets.size >= MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= current) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimits(): void {
  buckets.clear();
}
