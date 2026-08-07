import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

const MIN_SAMPLE = 20;
const WARN = 0.1;
const CRIT = 0.25;

export function qualityRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const rows = inputs.qualityChecks ?? [];
  const out: Recommendation[] = [];
  for (const r of rows) {
    if (r.sample < MIN_SAMPLE || r.warnRate < WARN) continue;
    const severity = r.warnRate >= CRIT ? "critical" : "warn";
    out.push({
      id: recId("quality", r.id, inputs.window),
      category: "quality",
      severity,
      subject: `stage:${r.id}`,
      title: `Tune stage "${r.id}" — quality regressions detected`,
      rationale: `${(r.warnRate * 100).toFixed(0)}% of runs verified as regressions for "${r.id}" (n=${r.sample}).`,
      evidence: [
        {
          metric: "warn_rate",
          value: Number(r.warnRate.toFixed(3)),
          threshold: WARN,
          window: inputs.window,
          sample: r.sample,
        },
      ],
      action: {
        kind: "plan-required",
        note: "Draft plan to revisit thresholds or algorithm parameters.",
      },
      createdAt: now,
    });
  }
  return out;
}
