// Deterministic plan advisor. Given a plan and recent cost history, suggests
// stages to drop or params to trim so the run stays within a wall-time budget.
// Pure — never mutates the plan; caller decides whether to apply.

import type { Capability, PremiumPlan } from "../../intelligence/plan";
import { getCapability } from "../../capabilities/registry";
import { CostPredictor } from "../performance/predictor";

export interface Advice {
  drop: Capability[];
  keep: Capability[];
  expectedMs: number;
  budgetMs: number;
}

export function adviseWithinBudget(
  plan: PremiumPlan,
  megapixels: number,
  budgetMs: number,
  predictor: CostPredictor,
): Advice {
  const costs = plan.stages.map((c) => {
    const learned = predictor.predict(c, megapixels);
    const desc = getCapability(c);
    const fallback = desc ? desc.budget.timeMsPerMP * megapixels : 50;
    return { id: c, ms: learned ?? fallback };
  });

  const priority: Record<Capability, number> = {
    deblock: 9,
    whiteBalance: 8,
    clahe: 7,
    bilateral: 6,
    microContrast: 5,
    sCurve: 4,
    vibrance: 3,
    faceRestore: 2,
  };
  const sorted = [...costs].sort(
    (a, b) => (priority[b.id as Capability] ?? 0) - (priority[a.id as Capability] ?? 0),
  );

  const keep: Capability[] = [];
  let running = 0;
  for (const item of sorted) {
    if (running + item.ms <= budgetMs) {
      keep.push(item.id as Capability);
      running += item.ms;
    }
  }
  const drop = plan.stages.filter((s) => !keep.includes(s));
  return { drop, keep, expectedMs: running, budgetMs };
}
