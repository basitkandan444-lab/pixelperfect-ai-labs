// Pure evolution engine. Given deterministic inputs, produces a sorted,
// deduped list of Recommendations. No I/O, no side effects.

import { bundleRule } from "./rules/bundle";
import { capabilityRule } from "./rules/capability";
import { conversionRule } from "./rules/conversion";
import { memoryRule } from "./rules/memory";
import { performanceRule } from "./rules/performance";
import { qualityRule } from "./rules/quality";
import type { EvolutionInputs, Recommendation, Severity } from "./types";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

export function runEvolution(inputs: EvolutionInputs): Recommendation[] {
  const now = inputs.now ?? new Date(0).toISOString();
  const all = [
    ...bundleRule(inputs, now),
    ...conversionRule(inputs, now),
    ...performanceRule(inputs, now),
    ...capabilityRule(inputs, now),
    ...qualityRule(inputs, now),
    ...memoryRule(inputs, now),
  ];
  const dedup = new Map<string, Recommendation>();
  for (const r of all) dedup.set(r.id, r);
  return Array.from(dedup.values()).sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return s !== 0 ? s : a.id.localeCompare(b.id);
  });
}
