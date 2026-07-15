// Reliability Intelligence — pure anomaly/prediction engine.
//
// Given a chronological series of telemetry snapshots (from the persistent
// `telemetry_snapshots` table), produce:
//   - alerts: rule-based detections with severity, evidence, and recommendation
//   - trend:  short linear-regression forecast on success rate & p95 latency
//   - risk:   0..1 risk score combining anomaly strength and trend direction
//
// Pure functions only — no fetches, no Supabase, no globals — so the same logic
// powers unit tests, /api/public/reliability, and the /ops dashboard.
// PII-free: input rows carry only numeric telemetry, no identifiers.

export type Severity = "info" | "warning" | "critical";

export interface SnapshotRow {
  ts: string; // ISO
  requests: number;
  success_rate: number; // 0..1
  avg_ms: number;
  p95_ms: number;
  lcp_p75: number;
  cls_p75: number;
  inp_p75: number;
  errors: Record<string, number>;
}

export interface ReliabilityAlert {
  id: string;
  kind:
    | "error_spike"
    | "success_rate_drop"
    | "latency_regression"
    | "lcp_regression"
    | "inp_regression"
    | "traffic_drop"
    | "new_error_code";
  severity: Severity;
  title: string;
  detail: string;
  evidence: {
    baseline: number;
    current: number;
    change: number; // relative change (current/baseline - 1) or absolute delta
    samples: { baseline: number; current: number };
  };
  recommendation: string;
  at: string; // ISO
}

export interface TrendForecast {
  metric: "success_rate" | "p95_ms" | "lcp_p75";
  slopePerHour: number;
  projected1h: number;
  projected24h: number;
  direction: "improving" | "steady" | "degrading";
}

export interface ReliabilityReport {
  windowHours: number;
  points: number;
  latest?: SnapshotRow;
  baseline?: SnapshotRow;
  alerts: ReliabilityAlert[];
  trends: TrendForecast[];
  risk: number; // 0..1
}

// ---- Helpers --------------------------------------------------------------

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Simple linear regression on (index, y). Returns slope per point. */
function regressSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs = ys.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function relChange(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : 1;
  return current / baseline - 1;
}

function sumErrors(row: SnapshotRow): number {
  return Object.values(row.errors ?? {}).reduce((a, b) => a + b, 0);
}

// ---- Alert rules ----------------------------------------------------------

const RULES: {
  kind: ReliabilityAlert["kind"];
  check: (baseline: SnapshotRow, current: SnapshotRow) => ReliabilityAlert | null;
}[] = [
  {
    kind: "error_spike",
    check: (b, c) => {
      const bErr = sumErrors(b);
      const cErr = sumErrors(c);
      if (cErr < 5) return null; // avoid noise on tiny volumes
      const change = relChange(cErr, Math.max(1, bErr));
      if (change < 1.5) return null; // >150% increase
      return {
        id: "error_spike",
        kind: "error_spike",
        severity: change > 3 ? "critical" : "warning",
        title: `Error volume increased ${Math.round(change * 100)}%`,
        detail: `Errors rose from ${bErr} to ${cErr} across recent windows.`,
        evidence: {
          baseline: bErr,
          current: cErr,
          change,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Inspect the runtime errors breakdown in /api/public/metrics and correlate with the latest deploy.",
        at: c.ts,
      };
    },
  },
  {
    kind: "success_rate_drop",
    check: (b, c) => {
      if (c.requests < 20) return null;
      const drop = b.success_rate - c.success_rate;
      if (drop < 0.02) return null; // < 2pp
      return {
        id: "success_rate_drop",
        kind: "success_rate_drop",
        severity: c.success_rate < 0.9 ? "critical" : "warning",
        title: `Success rate dropped ${(drop * 100).toFixed(1)}pp`,
        detail: `Success rate ${(b.success_rate * 100).toFixed(2)}% → ${(c.success_rate * 100).toFixed(2)}%.`,
        evidence: {
          baseline: b.success_rate,
          current: c.success_rate,
          change: -drop,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Check top error codes and recent deployments; page on-call if success rate stays below 98%.",
        at: c.ts,
      };
    },
  },
  {
    kind: "latency_regression",
    check: (b, c) => {
      if (c.requests < 20 || b.p95_ms === 0) return null;
      const change = relChange(c.p95_ms, b.p95_ms);
      if (change < 0.5) return null; // < 50% increase
      return {
        id: "latency_regression",
        kind: "latency_regression",
        severity: change > 1 ? "critical" : "warning",
        title: `p95 latency up ${Math.round(change * 100)}%`,
        detail: `p95 rose ${b.p95_ms}ms → ${c.p95_ms}ms.`,
        evidence: {
          baseline: b.p95_ms,
          current: c.p95_ms,
          change,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Correlate with recent deploys; check upstream provider latency and CPU-bound worker tasks.",
        at: c.ts,
      };
    },
  },
  {
    kind: "lcp_regression",
    check: (b, c) => {
      if (b.lcp_p75 === 0 || c.lcp_p75 === 0) return null;
      const change = relChange(c.lcp_p75, b.lcp_p75);
      if (change < 0.25 || c.lcp_p75 < 2500) return null;
      return {
        id: "lcp_regression",
        kind: "lcp_regression",
        severity: c.lcp_p75 > 4000 ? "critical" : "warning",
        title: `LCP p75 degraded ${Math.round(change * 100)}%`,
        detail: `LCP p75 ${b.lcp_p75}ms → ${c.lcp_p75}ms (target ≤ 2500ms).`,
        evidence: {
          baseline: b.lcp_p75,
          current: c.lcp_p75,
          change,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Inspect largest chunk sizes, hero image dimensions, and font-loading behavior.",
        at: c.ts,
      };
    },
  },
  {
    kind: "inp_regression",
    check: (b, c) => {
      if (b.inp_p75 === 0 || c.inp_p75 === 0) return null;
      const change = relChange(c.inp_p75, b.inp_p75);
      if (change < 0.25 || c.inp_p75 < 200) return null;
      return {
        id: "inp_regression",
        kind: "inp_regression",
        severity: c.inp_p75 > 500 ? "critical" : "warning",
        title: `INP p75 degraded ${Math.round(change * 100)}%`,
        detail: `INP p75 ${b.inp_p75}ms → ${c.inp_p75}ms (target ≤ 200ms).`,
        evidence: {
          baseline: b.inp_p75,
          current: c.inp_p75,
          change,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Profile main-thread long tasks; move heavy work into the enhancement Web Worker.",
        at: c.ts,
      };
    },
  },
  {
    kind: "traffic_drop",
    check: (b, c) => {
      if (b.requests < 50) return null;
      const change = relChange(c.requests, b.requests);
      if (change > -0.5) return null; // drop >50%
      return {
        id: "traffic_drop",
        kind: "traffic_drop",
        severity: change < -0.8 ? "critical" : "warning",
        title: `Traffic dropped ${Math.round(-change * 100)}%`,
        detail: `Requests fell ${b.requests} → ${c.requests}.`,
        evidence: {
          baseline: b.requests,
          current: c.requests,
          change,
          samples: { baseline: b.requests, current: c.requests },
        },
        recommendation:
          "Check CDN/edge health, DNS, and public entry pages; confirm no accidental noindex or blocking header.",
        at: c.ts,
      };
    },
  },
];

// ---- Alerting -------------------------------------------------------------

export function detectAlerts(rows: SnapshotRow[]): ReliabilityAlert[] {
  if (rows.length < 2) return [];
  const sorted = [...rows].sort((a, b) => a.ts.localeCompare(b.ts));
  const current = sorted[sorted.length - 1];
  // Baseline = median of prior points (robust to a single spike).
  const prior = sorted.slice(0, -1);
  const baseline: SnapshotRow = {
    ts: prior[0].ts,
    requests: Math.round(mean(prior.map((r) => r.requests))),
    success_rate: mean(prior.map((r) => r.success_rate)),
    avg_ms: Math.round(mean(prior.map((r) => r.avg_ms))),
    p95_ms: Math.round(mean(prior.map((r) => r.p95_ms))),
    lcp_p75: Math.round(mean(prior.map((r) => r.lcp_p75))),
    cls_p75: mean(prior.map((r) => r.cls_p75)),
    inp_p75: Math.round(mean(prior.map((r) => r.inp_p75))),
    errors: mergeErrorAverages(prior),
  };
  const alerts: ReliabilityAlert[] = [];
  for (const rule of RULES) {
    const hit = rule.check(baseline, current);
    if (hit) alerts.push(hit);
  }
  // New error code detection.
  const knownCodes = new Set<string>();
  for (const r of prior) for (const k of Object.keys(r.errors ?? {})) knownCodes.add(k);
  for (const k of Object.keys(current.errors ?? {})) {
    if (!knownCodes.has(k) && (current.errors[k] ?? 0) >= 3) {
      alerts.push({
        id: `new_error:${k}`,
        kind: "new_error_code",
        severity: "warning",
        title: `New error code observed: ${k}`,
        detail: `Error "${k}" appeared ${current.errors[k]} times in the current window with no prior occurrences.`,
        evidence: {
          baseline: 0,
          current: current.errors[k],
          change: 1,
          samples: { baseline: baseline.requests, current: current.requests },
        },
        recommendation: `Grep the codebase for error code "${k}"; add a runbook entry.`,
        at: current.ts,
      });
    }
  }
  return alerts;
}

function mergeErrorAverages(rows: SnapshotRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.errors ?? {})) acc[k] = (acc[k] ?? 0) + v;
  }
  const n = Math.max(1, rows.length);
  for (const k of Object.keys(acc)) acc[k] = acc[k] / n;
  return acc;
}

// ---- Trend forecast -------------------------------------------------------

export function forecastTrends(rows: SnapshotRow[]): TrendForecast[] {
  if (rows.length < 3) return [];
  const sorted = [...rows].sort((a, b) => a.ts.localeCompare(b.ts));
  const firstTs = Date.parse(sorted[0].ts);
  const lastTs = Date.parse(sorted[sorted.length - 1].ts);
  const spanHours = Math.max(0.5, (lastTs - firstTs) / 3_600_000);
  const perPointHours = spanHours / (sorted.length - 1);

  function forecast(metric: TrendForecast["metric"], ys: number[]): TrendForecast {
    const slopePerPoint = regressSlope(ys);
    const slopePerHour = perPointHours === 0 ? 0 : slopePerPoint / perPointHours;
    const last = ys[ys.length - 1];
    const projected1h = last + slopePerHour;
    const projected24h = last + slopePerHour * 24;
    let direction: TrendForecast["direction"] = "steady";
    const noise = Math.abs(mean(ys)) * 0.02 + 1e-6;
    if (Math.abs(slopePerHour) > noise) {
      const worse =
        metric === "success_rate" ? slopePerHour < 0 : slopePerHour > 0;
      direction = worse ? "degrading" : "improving";
    }
    return { metric, slopePerHour, projected1h, projected24h, direction };
  }

  return [
    forecast("success_rate", sorted.map((r) => r.success_rate)),
    forecast("p95_ms", sorted.map((r) => r.p95_ms)),
    forecast("lcp_p75", sorted.map((r) => r.lcp_p75)),
  ];
}

// ---- Risk score -----------------------------------------------------------

export function riskScore(alerts: ReliabilityAlert[], trends: TrendForecast[]): number {
  const alertWeight = alerts.reduce(
    (sum, a) => sum + (a.severity === "critical" ? 0.4 : a.severity === "warning" ? 0.2 : 0.05),
    0,
  );
  const trendWeight = trends.reduce(
    (sum, t) => sum + (t.direction === "degrading" ? 0.15 : 0),
    0,
  );
  return Math.max(0, Math.min(1, alertWeight + trendWeight));
}

// ---- Top-level report -----------------------------------------------------

export function buildReport(rows: SnapshotRow[], windowHours = 24): ReliabilityReport {
  const alerts = detectAlerts(rows);
  const trends = forecastTrends(rows);
  const sorted = [...rows].sort((a, b) => a.ts.localeCompare(b.ts));
  return {
    windowHours,
    points: rows.length,
    latest: sorted[sorted.length - 1],
    baseline: sorted[0],
    alerts,
    trends,
    risk: riskScore(alerts, trends),
  };
}
