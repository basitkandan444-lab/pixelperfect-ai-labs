// In-memory fixed-window rate limiter — a FOUNDATION, not a distributed limiter.
//
// LIMITATION (documented, by design): counters live in a single worker isolate's
// memory. On Cloudflare Workers each edge location / isolate keeps its own map
// and cold starts reset it, so this bounds abuse per-isolate but is NOT a global
// quota. A production-grade global limiter needs shared state (Durable Objects,
// KV, or Redis). The interface here is intentionally swappable so a distributed
// backend can replace `check()` without touching call sites.

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for Retry-After / X-RateLimit-Reset). */
  resetSec: number;
};

type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  check: (key: string, now?: number) => RateLimitResult;
};

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Cap the map size so a flood of unique keys cannot grow memory unbounded. */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = opts;
  const buckets = new Map<string, Bucket>();

  function sweep(now: number) {
    if (buckets.size < maxKeys) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    // Still too big after removing expired: drop oldest-resetting entries.
    if (buckets.size >= maxKeys) {
      const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      for (let i = 0; i < sorted.length && buckets.size >= maxKeys; i++) {
        buckets.delete(sorted[i][0]);
      }
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      sweep(now);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const remaining = Math.max(0, limit - bucket.count);
      const resetSec = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
      return {
        allowed: bucket.count <= limit,
        limit,
        remaining,
        resetSec,
      };
    },
  };
}

/** Best-effort client IP from edge headers. Falls back to a shared bucket. */
export function clientKeyFromRequest(request: Request): string {
  const h = request.headers;
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? ip : "unknown";
}
