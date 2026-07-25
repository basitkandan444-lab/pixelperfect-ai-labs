import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

const MIN_SAMPLE = 20;
const SLOWDOWN_WARN = 1.25;
const SLOWDOWN_CRIT = 1.5;

export function performanceRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const rows = inputs.browserPerf ?? [];
  const out: Recommendation[] = [];
  for (const r of rows) {
    if (r.sample < MIN_SAMPLE || r.baselineP95Ms <= 0) continue;
    const ratio = r.p95Ms / r.baselineP95Ms;
    if (ratio < SLOWDOWN_WARN) continue;
    const severity = ratio >= SLOWDOWN_CRIT ? "critical" : "warn";
    out.push({
      id: recId("performance", `browser:${r.browser}`, inputs.window),
      category: "performance",
      severity,
      subject: `browser:${r.browser}`,
      title: `Optimize fallback path for ${r.browser}`,
      rationale: `${r.browser} p95 is ${(ratio * 100 - 100).toFixed(0)}% slower than baseline (${r.p95Ms}ms vs ${r.baselineP95Ms}ms, n=${r.sample}).`,
      evidence: [
        {
          metric: "p95_ratio",
          value: Number(ratio.toFixed(3)),
          threshold: SLOWDOWN_WARN,
          window: inputs.window,
          sample: r.sample,
        },
      ],
      action: { kind: "plan-required", note: "Draft plan to tune backend selection or WASM fallback." },
      createdAt: now,
    });
  }
  return out;
}
