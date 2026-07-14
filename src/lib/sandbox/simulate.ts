// Loop 2 — Simulation, impact analysis, and recommendation engine.
//
// Pure functions over already-classified production sessions + a proposed
// rule set. Determines what would change if the rule set were shipped, and
// produces an objective recommendation with measurable reasons.

import type { SessionClassification } from "../intelligence.server";
import { reclassifyWithRules, type SandboxClassification } from "./engine";
import type { RuleSet } from "./rules";

// ---------- Comparison ----------

export interface SessionComparison {
  sessionId: string;
  before: {
    quality: number;
    human: number;
    confidence: string;
    risk: string;
    segment: string;
  };
  after: SandboxClassification;
  deltas: {
    quality: number;
    human: number; // 0..1
    confidenceChanged: boolean;
    riskChanged: boolean;
    humanFlipped: boolean; // crossed 0.5
  };
}

export interface DistributionSnapshot {
  total: number;
  humans: number; // human >= 0.5
  bots: number;
  humanPct: number;
  botPct: number;
  avgQuality: number;
  avgHuman: number;
  confidence: Record<string, number>;
  risk: Record<string, number>;
  segments: Record<string, number>;
}

function distSnapshot(items: { quality: number; human: number; confidence: string; risk: string; segment?: string }[]): DistributionSnapshot {
  const conf: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const risk: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const segs: Record<string, number> = {};
  let humans = 0;
  let sumQ = 0;
  let sumH = 0;
  for (const c of items) {
    if (c.human >= 0.5) humans++;
    sumQ += c.quality;
    sumH += c.human;
    conf[c.confidence] = (conf[c.confidence] ?? 0) + 1;
    risk[c.risk] = (risk[c.risk] ?? 0) + 1;
    if (c.segment) segs[c.segment] = (segs[c.segment] ?? 0) + 1;
  }
  const total = items.length;
  return {
    total,
    humans,
    bots: total - humans,
    humanPct: total ? humans / total : 0,
    botPct: total ? (total - humans) / total : 0,
    avgQuality: total ? sumQ / total : 0,
    avgHuman: total ? sumH / total : 0,
    confidence: conf,
    risk,
    segments: segs,
  };
}

// ---------- Impact analysis ----------

export interface ImpactAnalysis {
  humansAffected: number; // sessions where humanFlipped OR quality changed AND was human before/after
  botsAffected: number;
  highRiskChanged: number;
  lowRiskChanged: number;
  confidenceImprovements: number; // low→medium/high, medium→high
  confidenceDegradations: number; // reverse
  falsePositiveCandidates: number; // was bot (before) → human (after) with high confidence
  falseNegativeCandidates: number; // was human (before) → bot (after) with high confidence
  segmentMovement: number;
  overallImpactScore: number; // 0..1 fraction of sessions with any meaningful change
  totalSessions: number;
}

const CONF_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };

function analyzeImpact(cmp: SessionComparison[]): ImpactAnalysis {
  let humansAffected = 0;
  let botsAffected = 0;
  let highRiskChanged = 0;
  let lowRiskChanged = 0;
  let confImp = 0;
  let confDeg = 0;
  let fp = 0;
  let fn = 0;
  let anyChange = 0;
  for (const c of cmp) {
    const wasHuman = c.before.human >= 0.5;
    const isHuman = c.after.humanProbability >= 0.5;
    if (wasHuman) humansAffected += c.deltas.humanFlipped || Math.abs(c.deltas.quality) >= 5 ? 1 : 0;
    else botsAffected += c.deltas.humanFlipped || Math.abs(c.deltas.quality) >= 5 ? 1 : 0;
    if (c.before.risk === "high" && c.after.riskLevel !== "high") highRiskChanged++;
    if (c.before.risk === "low" && c.after.riskLevel !== "low") lowRiskChanged++;
    const rBefore = CONF_RANK[c.before.confidence] ?? 0;
    const rAfter = CONF_RANK[c.after.confidence] ?? 0;
    if (rAfter > rBefore) confImp++;
    else if (rAfter < rBefore) confDeg++;
    if (!wasHuman && isHuman && c.after.confidence === "high") fp++;
    if (wasHuman && !isHuman && c.after.confidence === "high") fn++;
    if (
      c.deltas.humanFlipped ||
      c.deltas.confidenceChanged ||
      c.deltas.riskChanged ||
      Math.abs(c.deltas.quality) >= 3
    ) {
      anyChange++;
    }
  }
  const total = cmp.length;
  return {
    humansAffected,
    botsAffected,
    highRiskChanged,
    lowRiskChanged,
    confidenceImprovements: confImp,
    confidenceDegradations: confDeg,
    falsePositiveCandidates: fp,
    falseNegativeCandidates: fn,
    segmentMovement: 0, // segment isn't re-derived in sandbox; movement is 0 by design
    overallImpactScore: total ? anyChange / total : 0,
    totalSessions: total,
  };
}

// ---------- Simulation ----------

export interface SimulationResult {
  simulationId: string;
  ranAt: string;
  ruleSet: RuleSet;
  before: DistributionSnapshot;
  after: DistributionSnapshot;
  impact: ImpactAnalysis;
  comparisons: SessionComparison[];
  recommendation: Recommendation;
  durationMs: number;
  sampleSize: number;
}

export interface SimulationInput {
  productionClassifications: SessionClassification[];
  proposedRules: RuleSet;
  simulationId?: string;
  now?: string;
  clock?: () => number; // for deterministic timing in tests
}

export function simulate(input: SimulationInput): SimulationResult {
  const clock = input.clock ?? (() => Date.now());
  const start = clock();
  const now = input.now ?? new Date(start).toISOString();
  const simulationId = input.simulationId ?? `sim-${start.toString(36)}`;

  const comparisons: SessionComparison[] = input.productionClassifications.map((c) => {
    const after = reclassifyWithRules(c, input.proposedRules);
    return {
      sessionId: c.session_id,
      before: {
        quality: c.qualityScore,
        human: c.humanProbability,
        confidence: c.confidence,
        risk: c.riskLevel,
        segment: c.segment,
      },
      after,
      deltas: {
        quality: after.qualityScore - c.qualityScore,
        human: after.humanProbability - c.humanProbability,
        confidenceChanged: after.confidence !== c.confidence,
        riskChanged: after.riskLevel !== c.riskLevel,
        humanFlipped: c.humanProbability >= 0.5 !== after.humanProbability >= 0.5,
      },
    };
  });

  const before = distSnapshot(
    input.productionClassifications.map((c) => ({
      quality: c.qualityScore,
      human: c.humanProbability,
      confidence: c.confidence,
      risk: c.riskLevel,
      segment: c.segment,
    })),
  );
  const after = distSnapshot(
    comparisons.map((c) => ({
      quality: c.after.qualityScore,
      human: c.after.humanProbability,
      confidence: c.after.confidence,
      risk: c.after.riskLevel,
      segment: c.before.segment,
    })),
  );
  const impact = analyzeImpact(comparisons);
  const recommendation = recommend(impact, before, after);

  const durationMs = clock() - start;
  return {
    simulationId,
    ranAt: now,
    ruleSet: input.proposedRules,
    before,
    after,
    impact,
    comparisons,
    recommendation,
    durationMs,
    sampleSize: comparisons.length,
  };
}

// ---------- Recommendation ----------

export type RecommendationVerdict =
  | "safe-to-deploy"
  | "deploy-with-caution"
  | "reject"
  | "requires-more-evidence";

export interface Recommendation {
  verdict: RecommendationVerdict;
  reasons: { code: string; message: string }[];
}

export function recommend(
  impact: ImpactAnalysis,
  before: DistributionSnapshot,
  after: DistributionSnapshot,
): Recommendation {
  const reasons: Recommendation["reasons"] = [];
  const total = impact.totalSessions;

  if (total < 30) {
    reasons.push({
      code: "sample-too-small",
      message: `Only ${total} session(s) in the window — insufficient statistical evidence.`,
    });
    return { verdict: "requires-more-evidence", reasons };
  }

  const humanShift = Math.abs(after.humanPct - before.humanPct);
  const impactPct = impact.overallImpactScore;
  const fpPct = impact.falsePositiveCandidates / total;
  const fnPct = impact.falseNegativeCandidates / total;
  const degradationPct = impact.confidenceDegradations / total;
  const improvementPct = impact.confidenceImprovements / total;

  reasons.push({
    code: "human-pct-shift",
    message: `Human % moves ${(humanShift * 100).toFixed(1)} points (${(before.humanPct * 100).toFixed(1)}% → ${(after.humanPct * 100).toFixed(1)}%).`,
  });
  reasons.push({
    code: "impact-scope",
    message: `${(impactPct * 100).toFixed(1)}% of sessions show a meaningful change.`,
  });
  reasons.push({
    code: "confidence-delta",
    message: `Confidence: ${impact.confidenceImprovements} improved, ${impact.confidenceDegradations} degraded.`,
  });
  if (impact.falsePositiveCandidates || impact.falseNegativeCandidates) {
    reasons.push({
      code: "risk-flips",
      message: `${impact.falsePositiveCandidates} FP candidate(s), ${impact.falseNegativeCandidates} FN candidate(s).`,
    });
  }

  if (fpPct > 0.05 || fnPct > 0.05 || humanShift > 0.2 || degradationPct > 0.25) {
    reasons.push({
      code: "regression-risk",
      message: "Change exceeds safety thresholds for FP/FN or population shift.",
    });
    return { verdict: "reject", reasons };
  }

  if (humanShift > 0.05 || impactPct > 0.2 || degradationPct > improvementPct) {
    return { verdict: "deploy-with-caution", reasons };
  }

  return { verdict: "safe-to-deploy", reasons };
}
