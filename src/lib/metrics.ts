// In-memory aggregate metrics — a FOUNDATION for efficiency/reliability visibility.
//
// LIMITATION: like the rate limiter, counters are per worker isolate and reset on
// cold start. They give a live, PII-free snapshot for one isolate and a place to
// hang real telemetry later (push to an analytics sink or time-series DB).
// No user content is ever recorded — only counts and durations.

export type MetricsSnapshot = {
  requests: number;
  success: number;
  failure: number;
  rejectedValidation: number;
  rejectedRateLimit: number;
  clientAborted: number;
  aiTimeouts: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  since: string;
};

const state = {
  requests: 0,
  success: 0,
  failure: 0,
  rejectedValidation: 0,
  rejectedRateLimit: 0,
  clientAborted: 0,
  aiTimeouts: 0,
  durations: [] as number[],
  since: new Date().toISOString(),
};

const MAX_SAMPLES = 500;

export const metrics = {
  requestStarted() {
    state.requests += 1;
  },
  validationRejected() {
    state.rejectedValidation += 1;
  },
  rateLimited() {
    state.rejectedRateLimit += 1;
  },
  aiTimeout() {
    state.aiTimeouts += 1;
  },
  clientAborted() {
    state.clientAborted += 1;
  },
  succeeded(durationMs: number) {
    state.success += 1;
    recordDuration(durationMs);
  },
  failed(durationMs?: number) {
    state.failure += 1;
    if (typeof durationMs === "number") recordDuration(durationMs);
  },
  snapshot(): MetricsSnapshot {
    const durations = state.durations;
    const total = state.success + state.failure;
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return {
      requests: state.requests,
      success: state.success,
      failure: state.failure,
      rejectedValidation: state.rejectedValidation,
      rejectedRateLimit: state.rejectedRateLimit,
      clientAborted: state.clientAborted,
      aiTimeouts: state.aiTimeouts,
      successRate: total ? Number((state.success / total).toFixed(4)) : 1,
      avgDurationMs: Math.round(avg),
      p95DurationMs: percentile(durations, 95),
      since: state.since,
    };
  },
};

function recordDuration(ms: number) {
  state.durations.push(ms);
  if (state.durations.length > MAX_SAMPLES) state.durations.shift();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}
