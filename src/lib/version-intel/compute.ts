// Loop 4 — Version Intelligence: pure, deterministic computations over the
// immutable `sandbox_simulation` audit stream. Never touches production
// scoring. Every function is side-effect free and safe to run in tests.

import type { DistributionSnapshot, ImpactAnalysis, RecommendationVerdict } from "@/lib/sandbox/simulate";
import type { RuleSet, WeightKey, ThresholdKey } from "@/lib/sandbox/rules";
import { WEIGHT_META, THRESHOLD_META } from "@/lib/sandbox/rules";

// ---------- Types ----------

export interface SimulationEntry {
  ts: string;
  simulationId: string;
  ranAt: string;
  engineVersion: string;
  ruleVersion: string;
  modelConfigHash: string;
  user?: string;
  sampleSize: number;
  durationMs: number;
  recommendation: RecommendationVerdict;
  before: DistributionSnapshot;
  after: DistributionSnapshot;
  impact: ImpactAnalysis;
  proposedRules: RuleSet;
}

export interface VersionSnapshot {
  engineVersion: string;
  simulations: number;
  latestAt: string;
  earliestAt: string;
  sampleTotal: number;
  humanPct: number;
  automationPct: number;
  unknownPct: number;
  avgQuality: number;
  medianQuality: number;
  p95Quality: number;
  qualityDistribution: { low: number; medium: number; high: number };
  avgConfidence: number; // 1..3
  confidenceDistribution: Record<string, number>;
  evidence: { positive: number; negative: number; conflicting: number };
  avgRisk: number; // 1..3
  riskDistribution: Record<string, number>;
  highRiskPct: number;
  mediumRiskPct: number;
  lowRiskPct: number;
  recommendationRate: Record<RecommendationVerdict, number>;
}

// ---------- Helpers ----------

const CONF_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };
const RISK_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}
function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
function avg(nums: number[]): number {
  return nums.length ? sum(nums) / nums.length : 0;
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}
function median(values: number[]): number {
  return percentile(values, 0.5);
}

function distSum(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function distAvgRank(dist: Record<string, number>, rank: Record<string, number>): number {
  let total = 0;
  let weighted = 0;
  for (const [k, v] of Object.entries(dist)) {
    total += v;
    weighted += (rank[k] ?? 0) * v;
  }
  return total ? weighted / total : 0;
}

// ---------- Version snapshots ----------

/**
 * Aggregate the immutable simulation stream into per-engine-version
 * snapshots. Uses the "after" distribution of each simulation because it
 * represents the engine's classification under its own configured rules.
 */
export function versionSnapshots(entries: SimulationEntry[]): VersionSnapshot[] {
  const byVersion = new Map<string, SimulationEntry[]>();
  for (const e of entries) {
    const arr = byVersion.get(e.engineVersion) ?? [];
    arr.push(e);
    byVersion.set(e.engineVersion, arr);
  }

  const out: VersionSnapshot[] = [];
  for (const [engineVersion, sims] of byVersion) {
    const sampleTotal = sum(sims.map((s) => s.sampleSize));
    const humanPct = avg(sims.map((s) => s.after.humanPct));
    const automationPct = avg(sims.map((s) => s.after.botPct));
    const unknownPct = Math.max(0, 1 - humanPct - automationPct);
    const qualities = sims.map((s) => s.after.avgQuality);
    const avgQuality = avg(qualities);
    const medianQuality = median(qualities);
    const p95Quality = percentile(qualities, 0.95);

    let confDist: Record<string, number> = {};
    let riskDist: Record<string, number> = {};
    for (const s of sims) {
      confDist = distSum(confDist, s.after.confidence);
      riskDist = distSum(riskDist, s.after.risk);
    }
    const avgConfidence = distAvgRank(confDist, CONF_RANK);
    const avgRisk = distAvgRank(riskDist, RISK_RANK);
    const riskTotal = Object.values(riskDist).reduce((a, b) => a + b, 0);

    const positive = sum(sims.map((s) => s.impact.confidenceImprovements));
    const negative = sum(sims.map((s) => s.impact.confidenceDegradations));
    const conflicting = sum(
      sims.map((s) => s.impact.falsePositiveCandidates + s.impact.falseNegativeCandidates),
    );

    const recCounts: Record<RecommendationVerdict, number> = {
      "safe-to-deploy": 0,
      "deploy-with-caution": 0,
      reject: 0,
      "requires-more-evidence": 0,
    };
    for (const s of sims) recCounts[s.recommendation]++;
    const recTotal = sims.length || 1;
    const recommendationRate: Record<RecommendationVerdict, number> = {
      "safe-to-deploy": recCounts["safe-to-deploy"] / recTotal,
      "deploy-with-caution": recCounts["deploy-with-caution"] / recTotal,
      reject: recCounts.reject / recTotal,
      "requires-more-evidence": recCounts["requires-more-evidence"] / recTotal,
    };

    const sortedByTime = [...sims].sort((a, b) => a.ts.localeCompare(b.ts));

    // Quality distribution buckets: low<40, medium 40-70, high>=70
    let qLow = 0;
    let qMed = 0;
    let qHigh = 0;
    for (const q of qualities) {
      if (q < 40) qLow++;
      else if (q < 70) qMed++;
      else qHigh++;
    }

    out.push({
      engineVersion,
      simulations: sims.length,
      earliestAt: sortedByTime[0]?.ts ?? "",
      latestAt: sortedByTime[sortedByTime.length - 1]?.ts ?? "",
      sampleTotal,
      humanPct,
      automationPct,
      unknownPct,
      avgQuality,
      medianQuality,
      p95Quality,
      qualityDistribution: { low: qLow, medium: qMed, high: qHigh },
      avgConfidence,
      confidenceDistribution: confDist,
      evidence: { positive, negative, conflicting },
      avgRisk,
      riskDistribution: riskDist,
      highRiskPct: pct(riskDist.high ?? 0, riskTotal),
      mediumRiskPct: pct(riskDist.medium ?? 0, riskTotal),
      lowRiskPct: pct(riskDist.low ?? 0, riskTotal),
      recommendationRate,
    });
  }

  return out.sort((a, b) => a.engineVersion.localeCompare(b.engineVersion));
}

// ---------- Version-to-version diff ----------

export interface VersionDiffMetric {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  isPct: boolean;
  polarity: "positive" | "negative" | "neutral";
  explanation: string;
}

export interface VersionDiff {
  baseline: string;
  candidate: string;
  metrics: VersionDiffMetric[];
  summary: string;
}

function polarize(delta: number, betterWhenHigher: boolean): "positive" | "negative" | "neutral" {
  if (Math.abs(delta) < 1e-9) return "neutral";
  const positive = betterWhenHigher ? delta > 0 : delta < 0;
  return positive ? "positive" : "negative";
}

function formatDelta(delta: number, isPct: boolean, digits = 1): string {
  const sign = delta > 0 ? "+" : "";
  return isPct ? `${sign}${(delta * 100).toFixed(digits)}%` : `${sign}${delta.toFixed(digits)}`;
}

/**
 * Compare two version snapshots and return every metric with a plain-language
 * explanation. Deterministic: same inputs → identical output.
 */
export function compareVersions(baseline: VersionSnapshot, candidate: VersionSnapshot): VersionDiff {
  const push = (
    key: string,
    label: string,
    before: number,
    after: number,
    isPct: boolean,
    betterWhenHigher: boolean,
    explanation: string,
  ): VersionDiffMetric => ({
    key,
    label,
    before,
    after,
    delta: after - before,
    isPct,
    polarity: polarize(after - before, betterWhenHigher),
    explanation,
  });

  const metrics: VersionDiffMetric[] = [
    push(
      "humanPct",
      "Human %",
      baseline.humanPct,
      candidate.humanPct,
      true,
      true,
      `Human classification rate moved ${formatDelta(candidate.humanPct - baseline.humanPct, true)}.`,
    ),
    push(
      "automationPct",
      "Automation %",
      baseline.automationPct,
      candidate.automationPct,
      true,
      false,
      `Automation classification rate moved ${formatDelta(candidate.automationPct - baseline.automationPct, true)}.`,
    ),
    push(
      "avgQuality",
      "Average quality",
      baseline.avgQuality,
      candidate.avgQuality,
      false,
      true,
      `Average quality score moved ${formatDelta(candidate.avgQuality - baseline.avgQuality, false)} points.`,
    ),
    push(
      "avgConfidence",
      "Average confidence (1-3)",
      baseline.avgConfidence,
      candidate.avgConfidence,
      false,
      true,
      `Confidence rank moved ${formatDelta(candidate.avgConfidence - baseline.avgConfidence, false, 2)}.`,
    ),
    push(
      "evidencePositive",
      "Positive evidence",
      baseline.evidence.positive,
      candidate.evidence.positive,
      false,
      true,
      `Positive evidence signals differ by ${formatDelta(candidate.evidence.positive - baseline.evidence.positive, false, 0)}.`,
    ),
    push(
      "evidenceNegative",
      "Negative evidence",
      baseline.evidence.negative,
      candidate.evidence.negative,
      false,
      false,
      `Negative evidence signals differ by ${formatDelta(candidate.evidence.negative - baseline.evidence.negative, false, 0)}.`,
    ),
    push(
      "evidenceConflicting",
      "Conflicting evidence",
      baseline.evidence.conflicting,
      candidate.evidence.conflicting,
      false,
      false,
      `Conflicting evidence (FP+FN candidates) moved ${formatDelta(candidate.evidence.conflicting - baseline.evidence.conflicting, false, 0)}.`,
    ),
    push(
      "highRiskPct",
      "High risk %",
      baseline.highRiskPct,
      candidate.highRiskPct,
      true,
      false,
      `High-risk share moved ${formatDelta(candidate.highRiskPct - baseline.highRiskPct, true)}.`,
    ),
    push(
      "mediumRiskPct",
      "Medium risk %",
      baseline.mediumRiskPct,
      candidate.mediumRiskPct,
      true,
      false,
      `Medium-risk share moved ${formatDelta(candidate.mediumRiskPct - baseline.mediumRiskPct, true)}.`,
    ),
    push(
      "lowRiskPct",
      "Low risk %",
      baseline.lowRiskPct,
      candidate.lowRiskPct,
      true,
      true,
      `Low-risk share moved ${formatDelta(candidate.lowRiskPct - baseline.lowRiskPct, true)}.`,
    ),
    push(
      "avgRisk",
      "Average risk (1-3)",
      baseline.avgRisk,
      candidate.avgRisk,
      false,
      false,
      `Average risk rank moved ${formatDelta(candidate.avgRisk - baseline.avgRisk, false, 2)}.`,
    ),
  ];

  const gains = metrics.filter((m) => m.polarity === "positive").length;
  const losses = metrics.filter((m) => m.polarity === "negative").length;
  const summary = `${candidate.engineVersion} vs ${baseline.engineVersion}: ${gains} improvement(s), ${losses} regression(s) across ${metrics.length} tracked metrics.`;

  return { baseline: baseline.engineVersion, candidate: candidate.engineVersion, metrics, summary };
}

// ---------- Rule impact analysis ----------

export interface RuleImpactRow {
  ruleKey: string;
  ruleName: string;
  currentWeight: number;
  previousWeight: number;
  delta: number;
  sessionsAffected: number;
  avgScoreChange: number;
  avgConfidenceChange: number;
  qualityChange: number;
  riskChange: number;
  topPositive: number;
  topNegative: number;
}

/**
 * Aggregate rule-level impact across the simulation stream. Each simulation
 * contributes its impact to whichever rule keys it moved off default.
 */
export function ruleImpactRows(entries: SimulationEntry[]): RuleImpactRow[] {
  const rows: RuleImpactRow[] = [];

  const trackWeights: WeightKey[] = Object.keys(WEIGHT_META) as WeightKey[];
  const trackThresholds: ThresholdKey[] = Object.keys(THRESHOLD_META) as ThresholdKey[];

  // Sort chronologically so previousWeight is the previous simulation's value.
  const chronological = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const latest = chronological[chronological.length - 1];

  for (const key of trackWeights) {
    const meta = WEIGHT_META[key];
    const current = latest?.proposedRules.weights[key] ?? 1;

    // Previous value = most recent simulation before the latest with a
    // different weight for this key.
    let previous = current;
    for (let i = chronological.length - 2; i >= 0; i--) {
      const w = chronological[i].proposedRules.weights[key];
      if (w !== current) {
        previous = w;
        break;
      }
    }

    const affectedSims = chronological.filter(
      (e) => e.proposedRules.weights[key] !== 1,
    );
    const sessionsAffected = sum(
      affectedSims.map((e) => e.impact.humansAffected + e.impact.botsAffected),
    );
    const avgScoreChange = avg(
      affectedSims.map((e) => e.after.avgQuality - e.before.avgQuality),
    );
    const avgConfidenceChange = avg(
      affectedSims.map(
        (e) =>
          distAvgRank(e.after.confidence, CONF_RANK) -
          distAvgRank(e.before.confidence, CONF_RANK),
      ),
    );
    const qualityChange = avg(
      affectedSims.map((e) => e.after.avgQuality - e.before.avgQuality),
    );
    const riskChange = avg(
      affectedSims.map(
        (e) => distAvgRank(e.after.risk, RISK_RANK) - distAvgRank(e.before.risk, RISK_RANK),
      ),
    );

    const deltas = affectedSims.map((e) => e.after.avgQuality - e.before.avgQuality);
    const topPositive = deltas.length ? Math.max(...deltas, 0) : 0;
    const topNegative = deltas.length ? Math.min(...deltas, 0) : 0;

    rows.push({
      ruleKey: `weights.${key}`,
      ruleName: meta.label,
      currentWeight: current,
      previousWeight: previous,
      delta: current - previous,
      sessionsAffected,
      avgScoreChange,
      avgConfidenceChange,
      qualityChange,
      riskChange,
      topPositive,
      topNegative,
    });
  }

  for (const key of trackThresholds) {
    const meta = THRESHOLD_META[key];
    const defaultVal = latest?.proposedRules.thresholds[key];
    if (defaultVal === undefined) continue;
    const current = defaultVal;
    let previous = current;
    for (let i = chronological.length - 2; i >= 0; i--) {
      const t = chronological[i].proposedRules.thresholds[key];
      if (t !== current) {
        previous = t;
        break;
      }
    }
    rows.push({
      ruleKey: `thresholds.${key}`,
      ruleName: meta.label,
      currentWeight: current,
      previousWeight: previous,
      delta: current - previous,
      sessionsAffected: 0,
      avgScoreChange: 0,
      avgConfidenceChange: 0,
      qualityChange: 0,
      riskChange: 0,
      topPositive: 0,
      topNegative: 0,
    });
  }

  return rows;
}

// ---------- Recommendation mapping ----------

export type PromotionRecommendation =
  | "safe-improvement"
  | "minor-improvement"
  | "needs-review"
  | "regression"
  | "reject";

export interface PromotionAssessment {
  recommendation: PromotionRecommendation;
  reasons: string[];
  evidence: { humanShift: number; overallImpact: number; fpRate: number; fnRate: number };
}

/**
 * Map a simulation's raw verdict + impact into the enterprise promotion
 * ladder required by Module F. Every recommendation carries evidence.
 */
export function assessPromotion(entry: SimulationEntry): PromotionAssessment {
  const total = Math.max(1, entry.impact.totalSessions);
  const humanShift = entry.after.humanPct - entry.before.humanPct;
  const overallImpact = entry.impact.overallImpactScore;
  const fpRate = entry.impact.falsePositiveCandidates / total;
  const fnRate = entry.impact.falseNegativeCandidates / total;

  const reasons: string[] = [
    `Verdict from simulator: ${entry.recommendation}.`,
    `${(overallImpact * 100).toFixed(1)}% of sessions show a meaningful change.`,
    `False-positive rate ${(fpRate * 100).toFixed(1)}%, false-negative rate ${(fnRate * 100).toFixed(1)}%.`,
  ];

  if (entry.recommendation === "reject") {
    reasons.push("Simulator flagged regression risk beyond safety thresholds.");
    return {
      recommendation: "reject",
      reasons,
      evidence: { humanShift, overallImpact, fpRate, fnRate },
    };
  }
  if (entry.recommendation === "requires-more-evidence") {
    reasons.push("Sample size too small for a statistically meaningful comparison.");
    return {
      recommendation: "needs-review",
      reasons,
      evidence: { humanShift, overallImpact, fpRate, fnRate },
    };
  }
  if (fpRate > 0.03 || fnRate > 0.03) {
    reasons.push("False-flag candidates exceed a conservative promotion budget (3%).");
    return {
      recommendation: "regression",
      reasons,
      evidence: { humanShift, overallImpact, fpRate, fnRate },
    };
  }
  if (entry.recommendation === "safe-to-deploy" && overallImpact < 0.05) {
    reasons.push("Minimal population shift — safe to promote.");
    return {
      recommendation: "safe-improvement",
      reasons,
      evidence: { humanShift, overallImpact, fpRate, fnRate },
    };
  }
  if (entry.recommendation === "safe-to-deploy") {
    reasons.push("Small positive movement — promote after canary.");
    return {
      recommendation: "minor-improvement",
      reasons,
      evidence: { humanShift, overallImpact, fpRate, fnRate },
    };
  }
  reasons.push("Change is meaningful but within caution band — schedule a review.");
  return {
    recommendation: "needs-review",
    reasons,
    evidence: { humanShift, overallImpact, fpRate, fnRate },
  };
}

// ---------- Timeline ----------

export interface TimelineEntry {
  ts: string;
  simulationId: string;
  engineVersion: string;
  ruleVersion: string;
  modelConfigHash: string;
  verdict: RecommendationVerdict;
  promotion: PromotionRecommendation;
  humanShift: number;
  qualityShift: number;
  ruleChanges: number;
  regression: boolean;
  milestone: boolean;
  note: string;
}

export function buildTimeline(entries: SimulationEntry[]): TimelineEntry[] {
  return [...entries]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((e) => {
      const assessment = assessPromotion(e);
      const humanShift = e.after.humanPct - e.before.humanPct;
      const qualityShift = e.after.avgQuality - e.before.avgQuality;
      // Count how many weights deviate from default (1) as "rule changes".
      let ruleChanges = 0;
      for (const key of Object.keys(WEIGHT_META) as WeightKey[]) {
        if (e.proposedRules.weights[key] !== 1) ruleChanges++;
      }
      const regression = assessment.recommendation === "regression" || assessment.recommendation === "reject";
      const milestone = assessment.recommendation === "safe-improvement" && Math.abs(qualityShift) >= 2;
      const note = milestone
        ? `Milestone: quality moved ${qualityShift.toFixed(1)} points safely.`
        : regression
          ? `Regression detected — ${assessment.recommendation}.`
          : `Simulation completed with verdict ${e.recommendation}.`;
      return {
        ts: e.ts,
        simulationId: e.simulationId,
        engineVersion: e.engineVersion,
        ruleVersion: e.ruleVersion,
        modelConfigHash: e.modelConfigHash,
        verdict: e.recommendation,
        promotion: assessment.recommendation,
        humanShift,
        qualityShift,
        ruleChanges,
        regression,
        milestone,
        note,
      };
    });
}

// ---------- Operational metrics ----------

export interface OperationalMetrics {
  totalSimulations: number;
  avgConfidence: number;
  avgEvidenceCount: number;
  avgQuality: number;
  avgBotProbability: number;
  riskDistribution: Record<string, number>;
  classificationDistribution: { humans: number; bots: number };
  confidenceTrend: { ts: string; value: number }[];
  evidenceTrend: { ts: string; value: number }[];
  versionAdoption: { engineVersion: string; share: number }[];
  simulationSuccessRate: number;
  promotionRate: number;
  regressionRate: number;
}

export function operationalMetrics(entries: SimulationEntry[]): OperationalMetrics {
  const total = entries.length;
  if (!total) {
    return {
      totalSimulations: 0,
      avgConfidence: 0,
      avgEvidenceCount: 0,
      avgQuality: 0,
      avgBotProbability: 0,
      riskDistribution: {},
      classificationDistribution: { humans: 0, bots: 0 },
      confidenceTrend: [],
      evidenceTrend: [],
      versionAdoption: [],
      simulationSuccessRate: 0,
      promotionRate: 0,
      regressionRate: 0,
    };
  }

  const chronological = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));

  const avgConfidence = avg(
    chronological.map((e) => distAvgRank(e.after.confidence, CONF_RANK)),
  );
  const avgEvidenceCount = avg(
    chronological.map((e) => e.impact.confidenceImprovements + e.impact.confidenceDegradations),
  );
  const avgQuality = avg(chronological.map((e) => e.after.avgQuality));
  const avgBotProbability = avg(chronological.map((e) => e.after.botPct));

  let riskDist: Record<string, number> = {};
  let humans = 0;
  let bots = 0;
  for (const e of chronological) {
    riskDist = distSum(riskDist, e.after.risk);
    humans += e.after.humans;
    bots += e.after.bots;
  }

  const confidenceTrend = chronological.map((e) => ({
    ts: e.ts,
    value: distAvgRank(e.after.confidence, CONF_RANK),
  }));
  const evidenceTrend = chronological.map((e) => ({
    ts: e.ts,
    value: e.impact.confidenceImprovements + e.impact.confidenceDegradations,
  }));

  const versionCounts = new Map<string, number>();
  for (const e of chronological) {
    versionCounts.set(e.engineVersion, (versionCounts.get(e.engineVersion) ?? 0) + 1);
  }
  const versionAdoption = [...versionCounts]
    .map(([engineVersion, count]) => ({ engineVersion, share: count / total }))
    .sort((a, b) => b.share - a.share);

  const promotions = chronological.filter((e) => {
    const r = assessPromotion(e).recommendation;
    return r === "safe-improvement" || r === "minor-improvement";
  }).length;
  const regressions = chronological.filter((e) => {
    const r = assessPromotion(e).recommendation;
    return r === "regression" || r === "reject";
  }).length;
  const successful = chronological.filter(
    (e) => e.recommendation !== "reject" && e.recommendation !== "requires-more-evidence",
  ).length;

  return {
    totalSimulations: total,
    avgConfidence,
    avgEvidenceCount,
    avgQuality,
    avgBotProbability,
    riskDistribution: riskDist,
    classificationDistribution: { humans, bots },
    confidenceTrend,
    evidenceTrend,
    versionAdoption,
    simulationSuccessRate: successful / total,
    promotionRate: promotions / total,
    regressionRate: regressions / total,
  };
}

// ---------- Leaderboard ----------

export interface LeaderboardRow {
  simulationId: string;
  ts: string;
  engineVersion: string;
  ruleVersion: string;
  sampleSize: number;
  humanPct: number;
  botPct: number;
  avgConfidence: number;
  avgQuality: number;
  winner: "after" | "before" | "tie";
  status: RecommendationVerdict;
  promotion: PromotionRecommendation;
  durationMs: number;
}

export function toLeaderboardRows(entries: SimulationEntry[]): LeaderboardRow[] {
  return entries.map((e) => {
    const assessment = assessPromotion(e);
    const qualityAfter = e.after.avgQuality;
    const qualityBefore = e.before.avgQuality;
    const winner: LeaderboardRow["winner"] =
      Math.abs(qualityAfter - qualityBefore) < 0.5
        ? "tie"
        : qualityAfter > qualityBefore
          ? "after"
          : "before";
    return {
      simulationId: e.simulationId,
      ts: e.ts,
      engineVersion: e.engineVersion,
      ruleVersion: e.ruleVersion,
      sampleSize: e.sampleSize,
      humanPct: e.after.humanPct,
      botPct: e.after.botPct,
      avgConfidence: distAvgRank(e.after.confidence, CONF_RANK),
      avgQuality: qualityAfter,
      winner,
      status: e.recommendation,
      promotion: assessment.recommendation,
      durationMs: e.durationMs,
    };
  });
}
