import type { EvolutionInputs, Recommendation } from "../types";
import { recId } from "../types";

const MIN_RUNS = 30;
const EXPAND_ATTR = 0.4; // 40%+ upgrades attributed → expand
const RETIRE_SHARE = 0.02; // <2% share → consider retire

export function capabilityRule(inputs: EvolutionInputs, now: string): Recommendation[] {
  const rows = inputs.capabilityUsage ?? [];
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);
  if (totalRuns < MIN_RUNS) return [];
  const out: Recommendation[] = [];
  for (const r of rows) {
    const share = r.runs / totalRuns;
    const attr = r.runs > 0 ? r.upgradeAttributions / r.runs : 0;
    if (attr >= EXPAND_ATTR && r.runs >= MIN_RUNS) {
      out.push({
        id: recId("capability", `expand:${r.id}`, inputs.window),
        category: "capability",
        severity: "warn",
        subject: `capability:${r.id}`,
        title: `Prioritize and expand capability "${r.id}"`,
        rationale: `${(attr * 100).toFixed(0)}% of "${r.id}" runs are attributed to upgrades (n=${r.runs}).`,
        evidence: [
          {
            metric: "upgrade_attribution",
            value: Number(attr.toFixed(3)),
            threshold: EXPAND_ATTR,
            window: inputs.window,
            sample: r.runs,
          },
        ],
        action: {
          kind: "plan-required",
          note: "Draft plan to widen this capability's coverage or expose variants.",
        },
        createdAt: now,
      });
    }
    if (share < RETIRE_SHARE && totalRuns >= 200) {
      out.push({
        id: recId("capability", `retire:${r.id}`, inputs.window),
        category: "capability",
        severity: "info",
        subject: `capability:${r.id}`,
        title: `Review low-use capability "${r.id}"`,
        rationale: `Only ${(share * 100).toFixed(1)}% of runs use "${r.id}" (n=${r.runs}/${totalRuns}).`,
        evidence: [
          {
            metric: "usage_share",
            value: Number(share.toFixed(4)),
            threshold: RETIRE_SHARE,
            window: inputs.window,
            sample: totalRuns,
          },
        ],
        action: {
          kind: "plan-required",
          note: "Consider deprecating or gating behind explicit intent.",
        },
        createdAt: now,
      });
    }
  }
  return out;
}
