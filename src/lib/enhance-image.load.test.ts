// Performance & load-testing foundation for the enhancement pipeline.
//
// This exercises the real request orchestrator (`handleEnhanceImage`) with an
// injected fake AI gateway so we can *measure* behaviour under pressure instead
// of asserting "it should scale". Every dependency that would reach the network
// is mocked, so the numbers reflect our own request handling, validation, rate
// limiting and retry/timeout logic — deterministically and offline.
//
// Scenarios:
//   1. Normal load    — many concurrent users, stable success + bounded latency.
//   2. High load      — a burst from one client, rate limits engage correctly.
//   3. Failure load   — upstream timeouts/5xx, bounded retries then recovery.
//
// Latency budgets are intentionally generous (CI machines vary); they exist to
// catch pathological regressions — e.g. accidental O(n^2) work or a serial
// bottleneck — not to benchmark absolute speed.
import { describe, it, expect } from "vitest";

import { handleEnhanceImage, TimeoutError, type EnhanceDeps } from "./enhance-image.core";
import { createRateLimiter } from "./rate-limit";

// A minimal but schema-valid base64 image data URL (matches DATA_URL_RE).
const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA=";

function makeRequest(ip: string): Request {
  return new Request("http://localhost/api/enhance-image", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ image: DATA_URL, scale: "4k" }),
  });
}

/** A fake gateway that returns a valid image after an optional simulated delay. */
function successFetch(delayMs = 0): typeof fetch {
  return (async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return new Response(
      JSON.stringify({
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,ok" } }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function baseDeps(overrides: Partial<EnhanceDeps> = {}): EnhanceDeps {
  return {
    apiKey: "test-key",
    fetchImpl: successFetch(),
    // Fresh limiter per scenario so buckets never leak between tests.
    rateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    timeoutMs: 200,
    maxRetries: 2,
    ...overrides,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

describe("load — normal traffic (many concurrent users)", () => {
  it("handles concurrent users with stable success and bounded latency", async () => {
    const CONCURRENCY = 40;
    const deps = baseDeps({ fetchImpl: successFetch(5) });

    const latencies: number[] = [];
    const started = Date.now();

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, i) => {
        const t0 = Date.now();
        const res = await handleEnhanceImage(makeRequest(`10.0.0.${i}`), deps);
        latencies.push(Date.now() - t0);
        return res;
      }),
    );

    // Every distinct user succeeds — no dropped or failed requests.
    expect(responses.every((r) => r.status === 200)).toBe(true);

    // Concurrency actually overlaps: wall-clock is far below the serial sum.
    const wall = Date.now() - started;
    expect(wall).toBeLessThan(CONCURRENCY * 5);

    // p95 stays within a generous budget — regression tripwire, not a benchmark.
    expect(percentile(latencies, 95)).toBeLessThan(500);
  });
});

describe("load — high traffic burst (rate limiting)", () => {
  it("admits requests up to the limit and rejects the overflow with 429 + Retry-After", async () => {
    const LIMIT = 15;
    const BURST = 30;
    const deps = baseDeps({
      rateLimiter: createRateLimiter({ limit: LIMIT, windowMs: 60_000 }),
    });

    const responses = await Promise.all(
      Array.from({ length: BURST }, () => handleEnhanceImage(makeRequest("203.0.113.7"), deps)),
    );

    const ok = responses.filter((r) => r.status === 200);
    const limited = responses.filter((r) => r.status === 429);

    // Exactly the window's worth are admitted; the rest are shed cleanly.
    expect(ok).toHaveLength(LIMIT);
    expect(limited).toHaveLength(BURST - LIMIT);

    // Shed requests carry actionable back-off metadata (no broken responses).
    for (const r of limited) {
      expect(r.headers.get("Retry-After")).toBeTruthy();
      expect(r.headers.get("X-RateLimit-Limit")).toBe(String(LIMIT));
    }
  });

  it("isolates rate-limit buckets per client so one abuser cannot starve others", async () => {
    const deps = baseDeps({ rateLimiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) });

    // Abuser exhausts its own window.
    await handleEnhanceImage(makeRequest("198.51.100.1"), deps);
    await handleEnhanceImage(makeRequest("198.51.100.1"), deps);
    const abuserBlocked = await handleEnhanceImage(makeRequest("198.51.100.1"), deps);
    expect(abuserBlocked.status).toBe(429);

    // A different client is unaffected.
    const other = await handleEnhanceImage(makeRequest("198.51.100.2"), deps);
    expect(other.status).toBe(200);
  });
});

describe("load — failure conditions (timeout, upstream 5xx, recovery)", () => {
  it("bounds retries on upstream timeouts and returns a 504", async () => {
    let calls = 0;
    const timingOutFetch = (async () => {
      calls += 1;
      throw new TimeoutError();
    }) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      makeRequest("192.0.2.10"),
      baseDeps({ fetchImpl: timingOutFetch, maxRetries: 2 }),
    );

    expect(res.status).toBe(504);
    // Bounded work: initial attempt + exactly maxRetries retries, never a storm.
    expect(calls).toBe(3);
  });

  it("retries transient 5xx then surfaces a bounded 502 on repeated failure", async () => {
    let calls = 0;
    const flakyFetch = (async () => {
      calls += 1;
      return new Response("upstream boom", { status: 503 });
    }) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      makeRequest("192.0.2.11"),
      baseDeps({ fetchImpl: flakyFetch, maxRetries: 2 }),
    );

    expect(res.status).toBe(502);
    expect(calls).toBe(3);
  });

  it("recovers: after upstream failures, a healthy request succeeds again", async () => {
    let call = 0;
    // First upstream call fails with a 500, retry succeeds — the system heals
    // within a single request without operator intervention.
    const recoveringFetch = (async () => {
      call += 1;
      if (call === 1) return new Response("boom", { status: 500 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,ok" } }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      makeRequest("192.0.2.12"),
      baseDeps({ fetchImpl: recoveringFetch }),
    );

    expect(res.status).toBe(200);
    expect(call).toBe(2);
  });
});
