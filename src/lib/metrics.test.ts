import { describe, expect, it } from "vitest";

import { metrics } from "@/lib/metrics";

// `metrics` is a process-wide singleton (one isolate), so these tests assert on
// deltas and invariants rather than absolute values. They guard the reliability
// dashboard: a broken counter or percentile silently hides production failures.

describe("metrics", () => {
  it("counts requests, successes and failures independently", () => {
    const before = metrics.snapshot();
    metrics.requestStarted();
    metrics.succeeded(100);
    metrics.failed(200);
    const after = metrics.snapshot();
    expect(after.requests - before.requests).toBe(1);
    expect(after.success - before.success).toBe(1);
    expect(after.failure - before.failure).toBe(1);
  });

  it("tracks the distinct rejection and abort categories", () => {
    const before = metrics.snapshot();
    metrics.validationRejected();
    metrics.rateLimited();
    metrics.clientAborted();
    metrics.aiTimeout();
    const after = metrics.snapshot();
    expect(after.rejectedValidation - before.rejectedValidation).toBe(1);
    expect(after.rejectedRateLimit - before.rejectedRateLimit).toBe(1);
    expect(after.clientAborted - before.clientAborted).toBe(1);
    expect(after.aiTimeouts - before.aiTimeouts).toBe(1);
  });

  it("keeps successRate a ratio between 0 and 1", () => {
    metrics.succeeded(50);
    const snap = metrics.snapshot();
    expect(snap.successRate).toBeGreaterThanOrEqual(0);
    expect(snap.successRate).toBeLessThanOrEqual(1);
  });

  it("reports p95 that is never below the average latency", () => {
    for (const ms of [10, 20, 30, 40, 1000]) metrics.succeeded(ms);
    const snap = metrics.snapshot();
    // p95 captures the tail, so it must sit at or above the mean.
    expect(snap.p95DurationMs).toBeGreaterThanOrEqual(snap.avgDurationMs);
  });

  it("exposes a stable 'since' timestamp for the snapshot window", () => {
    expect(() => new Date(metrics.snapshot().since).toISOString()).not.toThrow();
  });

  it("aggregates runtime errors by code for the command center", () => {
    const before = metrics.snapshot();
    metrics.failed(100, "ai_timeout");
    metrics.failed(100, "ai_timeout");
    metrics.errorRecorded("ai_failed");
    const after = metrics.snapshot();
    expect((after.errors.ai_timeout ?? 0) - (before.errors.ai_timeout ?? 0)).toBe(2);
    expect((after.errors.ai_failed ?? 0) - (before.errors.ai_failed ?? 0)).toBe(1);
    // failed() without a code still counts a failure but no error code.
    const mid = metrics.snapshot();
    metrics.failed(50);
    expect(metrics.snapshot().failure - mid.failure).toBe(1);
  });
});
