// Loop 2 — Sandbox engine: pure re-scoring of a production classification
// under a proposed rule set. No production state is mutated; the same input
// always produces the same output.

import type { SessionClassification } from "../intelligence.server";
import type { RuleSet } from "./rules";
import { categorize } from "./rules";

export type Confidence = "low" | "medium" | "high";
export type Risk = "low" | "medium" | "high";

export interface SandboxClassification {
  session_id: string;
  qualityScore: number;
  humanProbability: number;
  automationProbability: number;
  confidence: Confidence;
  riskLevel: Risk;
  evidencePoints: number;
  affectedEvidenceCount: number;
}

/** Cap per-signal contribution to keep the score robust to a single noisy signal. */
const BASE_CAP = 25;

/**
 * Re-score a production classification under a proposed rule set. This is
 * additive over the same evidence array — we never re-derive signals from
 * raw events, so there is zero risk of touching production scoring.
 */
export function reclassifyWithRules(
  c: SessionClassification,
  rules: RuleSet,
): SandboxClassification {
  let score = 50;
  let evPoints = 0;
  let affected = 0;

  for (const e of c.evidence) {
    const cat = categorize(e.signal);
    const m = cat ? rules.weights[cat] : 1;
    if (cat && m !== 1) affected++;
    const capped = Math.min(e.weight * m, BASE_CAP * Math.max(m, 1));
    evPoints += capped;
    score += e.direction === "positive" ? capped : -capped;
  }

  const qualityScore = Math.max(0, Math.min(100, score));
  const humanProbability = 1 / (1 + Math.exp(-(qualityScore - 50) / 12));
  const automationProbability = 1 - humanProbability;

  const t = rules.thresholds;
  const confidence: Confidence =
    evPoints >= t.evidenceHigh ? "high" : evPoints >= t.evidenceMedium ? "medium" : "low";
  const riskLevel: Risk =
    automationProbability > t.automationHigh && evPoints >= t.riskEvidenceMin
      ? "high"
      : automationProbability > t.automationMedium
        ? "medium"
        : "low";

  return {
    session_id: c.session_id,
    qualityScore,
    humanProbability,
    automationProbability,
    confidence,
    riskLevel,
    evidencePoints: evPoints,
    affectedEvidenceCount: affected,
  };
}
