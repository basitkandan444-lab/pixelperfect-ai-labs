// Per-isolate Web Vitals aggregation — the server side of the performance
// dashboard. Browsers beacon field measurements (LCP, CLS, INP, FCP, TTFB) to
// /api/public/vitals; this module aggregates them into per-metric percentiles
// and Core-Web-Vitals "good / needs-improvement / poor" rating counts.
//
// LIMITATION (same as metrics.ts / rate-limit.ts): state is per worker isolate
// and resets on cold start. It is a live, PII-free snapshot and a place to hang
// a real time-series sink later. No URLs, user agents or identifiers are stored
// — only the metric name, a numeric value and a rating bucket.

export const VITAL_NAMES = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

export type VitalRating = "good" | "needs-improvement" | "poor";

export type VitalSample = {
  name: VitalName;
  value: number;
  rating?: VitalRating;
};

export type VitalMetricSummary = {
  count: number;
  p75: number;
  good: number;
  needsImprovement: number;
  poor: number;
};

export type VitalsSnapshot = {
  samples: number;
  metrics: Record<VitalName, VitalMetricSummary>;
  since: string;
};

// Standard Core Web Vitals thresholds (good ≤ / poor >) used as a fallback when
// the client does not send a rating. Units: ms except CLS (unitless).
const THRESHOLDS: Record<VitalName, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

const MAX_SAMPLES_PER_METRIC = 500;

type MetricState = {
  values: number[];
  good: number;
  needsImprovement: number;
  poor: number;
};

function emptyMetricState(): MetricState {
  return { values: [], good: 0, needsImprovement: 0, poor: 0 };
}

const state: { metrics: Record<VitalName, MetricState>; total: number; since: string } = {
  metrics: {
    LCP: emptyMetricState(),
    CLS: emptyMetricState(),
    INP: emptyMetricState(),
    FCP: emptyMetricState(),
    TTFB: emptyMetricState(),
  },
  total: 0,
  since: new Date().toISOString(),
};

export function ratingFor(name: VitalName, value: number): VitalRating {
  const t = THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value > t.poor) return "poor";
  return "needs-improvement";
}

export const vitals = {
  record(sample: VitalSample): void {
    const name = sample.name;
    if (!VITAL_NAMES.includes(name)) return;
    if (!Number.isFinite(sample.value) || sample.value < 0) return;

    const m = state.metrics[name];
    m.values.push(sample.value);
    if (m.values.length > MAX_SAMPLES_PER_METRIC) m.values.shift();

    const rating = sample.rating ?? ratingFor(name, sample.value);
    if (rating === "good") m.good += 1;
    else if (rating === "poor") m.poor += 1;
    else m.needsImprovement += 1;

    state.total += 1;
  },

  snapshot(): VitalsSnapshot {
    const metrics = {} as Record<VitalName, VitalMetricSummary>;
    for (const name of VITAL_NAMES) {
      const m = state.metrics[name];
      metrics[name] = {
        count: m.values.length,
        p75: percentile(m.values, 75),
        good: m.good,
        needsImprovement: m.needsImprovement,
        poor: m.poor,
      };
    }
    return { samples: state.total, metrics, since: state.since };
  },
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  const v = sorted[Math.max(0, idx)];
  // CLS is fractional; keep two decimals. Timing metrics round to whole ms.
  return v < 10 ? Number(v.toFixed(2)) : Math.round(v);
}
