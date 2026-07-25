import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

export function memoryRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const rows = inputs.memoryPeaksMB ?? [];
  const out: Recommendation[] = [];
  for (const r of rows) {
    if (r.budgetMB <= 0 || r.peakMB <= r.budgetMB) continue;
    const ratio = r.peakMB / r.budgetMB;
    const severity = ratio >= 1.5 ? "critical" : "warn";
    out.push({
      id: recId("memory", r.id, inputs.window),
      category: "memory",
      severity,
      subject: `stage:${r.id}`,
      title: `Reduce memory for "${r.id}"`,
      rationale: `Peak memory ${r.peakMB.toFixed(1)}MB exceeds budget ${r.budgetMB}MB.`,
      evidence: [{
        metric: "peak_mb",
        value: Number(r.peakMB.toFixed(2)),
        threshold: r.budgetMB,
        window: inputs.window,
        sample: 1,
      }],
      action: { kind: "plan-required", note: "Draft plan to pool buffers or tile the stage." },
      createdAt: now,
    });
  }
  return out;
}
