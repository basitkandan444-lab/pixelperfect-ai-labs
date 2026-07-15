// Anomaly & trend detection on time-series numeric points. Pure, no I/O.
//
// - `zscoreAnomalies` flags points whose value is > `threshold` standard
//   deviations from the trailing mean over a rolling `window`.
// - `linearTrend` fits y = a + b*x on evenly-spaced points and returns slope,
//   intercept, R², and a coarse direction tag.
// - `pearsonCorrelation` measures linear association between two aligned series.

export type SeriesPoint = { ts: string; value: number };

export type Anomaly = {
  ts: string;
  value: number;
  baseline_mean: number;
  baseline_std: number;
  z_score: number;
  direction: "spike" | "drop";
};

export function zscoreAnomalies(
  series: SeriesPoint[],
  opts: { window?: number; threshold?: number } = {},
): Anomaly[] {
  const window = Math.max(3, Math.floor(opts.window ?? 12));
  const threshold = opts.threshold ?? 3;
  const out: Anomaly[] = [];
  for (let i = window; i < series.length; i++) {
    const slice = series.slice(i - window, i).map((p) => p.value);
    const mean = avg(slice);
    const std = stdDev(slice, mean);
    if (std === 0 || !Number.isFinite(std)) continue;
    const z = (series[i].value - mean) / std;
    if (Math.abs(z) >= threshold) {
      out.push({
        ts: series[i].ts,
        value: series[i].value,
        baseline_mean: round(mean),
        baseline_std: round(std),
        z_score: round(z),
        direction: z > 0 ? "spike" : "drop",
      });
    }
  }
  return out;
}

export type Trend = {
  slope: number;
  intercept: number;
  r_squared: number;
  direction: "up" | "down" | "flat";
  points: number;
};

export function linearTrend(series: SeriesPoint[]): Trend {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: n ? series[0].value : 0, r_squared: 0, direction: "flat", points: n };
  const xs = series.map((_, i) => i);
  const ys = series.map((p) => p.value);
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = intercept + slope * xs[i];
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  const direction: Trend["direction"] =
    Math.abs(slope) < 1e-9 ? "flat" : slope > 0 ? "up" : "down";
  return {
    slope: round(slope),
    intercept: round(intercept),
    r_squared: round(Math.max(0, Math.min(1, r2))),
    direction,
    points: n,
  };
}

/** Pearson correlation coefficient in [-1, 1]. Series must be aligned/equal length. */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = avg(a.slice(0, n));
  const mb = avg(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den ? round(num / den) : 0;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function stdDev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mean) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}
function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
