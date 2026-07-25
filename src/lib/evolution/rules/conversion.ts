import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

const MIN_SAMPLE = 25;
const WALL_ABANDON_WARN = 0.5;
const WALL_ABANDON_CRIT = 0.75;

export function conversionRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const c = inputs.conversion;
  if (!c || c.wallHits < MIN_SAMPLE) return [];
  const abandonRate = c.wallHits > 0 ? c.wallAbandons / c.wallHits : 0;
  if (abandonRate < WALL_ABANDON_WARN) return [];
  const severity = abandonRate >= WALL_ABANDON_CRIT ? "critical" : "warn";
  return [
    {
      id: recId("conversion", "upgrade-wall", inputs.window),
      category: "conversion",
      severity,
      subject: "upgrade-wall",
      title: "Improve upgrade-wall messaging",
      rationale: `${Math.round(abandonRate * 100)}% of users who hit the upgrade wall abandoned (n=${c.wallHits}).`,
      evidence: [
        {
          metric: "wall_abandon_rate",
          value: Number(abandonRate.toFixed(3)),
          threshold: WALL_ABANDON_WARN,
          window: inputs.window,
          sample: c.wallHits,
        },
      ],
      action: { kind: "plan-required", note: "Draft A/B messaging test for the upgrade wall." },
      createdAt: now,
    },
  ];
}
