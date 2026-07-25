// Compatibility policy: filter a PremiumPlan down to what the current browser
// can actually run. Preserves ordering and weight semantics; removed stages
// have their weight redistributed proportionally across survivors.

import type { PremiumPlan } from "../../intelligence/plan";
import { getCapability } from "../../capabilities/registry";
import type { FeatureFlag } from "../../capabilities/types";

export interface GateResult {
  plan: PremiumPlan;
  removed: string[];
  reasons: string[];
}

export function gatePlan(plan: PremiumPlan, available: ReadonlySet<FeatureFlag>): GateResult {
  const removed: string[] = [];
  const reasons: string[] = [...plan.reasons];
  const kept = plan.stages.filter((stage) => {
    const desc = getCapability(stage);
    if (!desc) return true; // unknown stage: leave it, selector owned it
    const missing = desc.requires.filter((f) => !available.has(f));
    if (missing.length === 0) return true;
    removed.push(stage);
    reasons.push(`gated:${stage} missing=${missing.join(",")}`);
    return false;
  });

  if (kept.length === plan.stages.length) return { plan, removed, reasons };

  const weights: PremiumPlan["weights"] = {};
  const total = kept.reduce((s, c) => s + (plan.weights[c] ?? 0), 0) || 1;
  for (const c of kept) weights[c] = (plan.weights[c] ?? 0) / total;

  return {
    plan: { ...plan, stages: kept, weights, reasons },
    removed,
    reasons,
  };
}
