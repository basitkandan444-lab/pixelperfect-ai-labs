import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

export function bundleRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const b = inputs.bundle;
  if (!b) return [];
  const out: Recommendation[] = [];
  if (b.freeChunkDeltaBytes > 0) {
    out.push({
      id: recId("bundle", "free-chunk-leak", inputs.window),
      category: "bundle",
      severity: "critical",
      subject: "bundle:free",
      title: "Free bundle grew — premium code likely leaked",
      rationale: `Free chunk grew by ${b.freeChunkDeltaBytes} bytes; premium modules must never enter the free path.`,
      evidence: [
        {
          metric: "free_chunk_delta_bytes",
          value: b.freeChunkDeltaBytes,
          threshold: 0,
          window: inputs.window,
          sample: 1,
        },
      ],
      action: {
        kind: "plan-required",
        note: "Draft plan to isolate leaking import and add lint/guard.",
      },
      createdAt: now,
    });
  }
  if (b.premiumChunkBudgetBytes > 0 && b.premiumChunkBytes > b.premiumChunkBudgetBytes) {
    out.push({
      id: recId("bundle", "premium-chunk-budget", inputs.window),
      category: "bundle",
      severity: "warn",
      subject: "bundle:premium",
      title: "Premium chunk over budget — consider splitting",
      rationale: `Premium chunk is ${b.premiumChunkBytes}B vs budget ${b.premiumChunkBudgetBytes}B.`,
      evidence: [
        {
          metric: "premium_chunk_bytes",
          value: b.premiumChunkBytes,
          threshold: b.premiumChunkBudgetBytes,
          window: inputs.window,
          sample: 1,
        },
      ],
      action: { kind: "plan-required", note: "Split premium modules along capability boundaries." },
      createdAt: now,
    });
  }
  return out;
}
