import { describe, expect, it } from "vitest";

import type { SessionClassification } from "./intelligence.server";
import { reclassifyWithRules } from "./sandbox/engine";
import {
  DEFAULT_RULES,
  categorize,
  diffRuleSets,
  mergeRules,
  validateRuleSet,
} from "./sandbox/rules";
import { recommend, simulate } from "./sandbox/simulate";

function mkClass(overrides: Partial<SessionClassification> = {}): SessionClassification {
  const evidence = overrides.evidence ?? [
    { signal: "Sustained reading behavior", direction: "positive", weight: 12 },
    { signal: "Multi-page navigation", direction: "positive", weight: 5 },
    { signal: "Human-like timing variance", direction: "positive", weight: 3 },
  ];
  const score =
    50 +
    evidence.reduce(
      (a, e) => a + (e.direction === "positive" ? e.weight : -e.weight),
      0,
    );
  const q = Math.max(0, Math.min(100, score));
  const h = 1 / (1 + Math.exp(-(q - 50) / 12));
  return {
    session_id: overrides.session_id ?? "s1",
    humanProbability: h,
    automationProbability: 1 - h,
    qualityScore: q,
    confidence: "medium",
    segment: "Interested",
    intentScore: 60,
    engagementScore: 60,
    riskLevel: "low",
    evidence,
    reasons: [],
    device: null,
    source: null,
    country: null,
    duration_ms: 20_000,
    events: 8,
    first: "2026-07-14T10:00:00Z",
    last: "2026-07-14T10:00:20Z",
    summary: null,
    rageClicks: 0,
    deadClicks: 0,
    ...overrides,
  };
}


describe("rules", () => {
  it("validates default rules", () => {
    expect(validateRuleSet(DEFAULT_RULES).ok).toBe(true);
  });

  it("rejects out-of-range weights, non-finite values, and threshold conflicts", () => {
    const bad = mergeRules({
      weights: { rageClick: 99, deadClick: Number.NaN } as never,
      thresholds: { evidenceHigh: 10, evidenceMedium: 20, humanHigh: 0.2, humanLow: 0.4 } as never,
    });
    const v = validateRuleSet(bad);
    expect(v.ok).toBe(false);
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain("weight-out-of-range");
    expect(codes).toContain("weight-non-finite");
    expect(codes).toContain("threshold-conflict");
  });

  it("categorizes evidence signals", () => {
    expect(categorize("Robotic click rhythm")).toBe("clickRhythm");
    expect(categorize("Uniform mouse speed (script-like)")).toBe("mouseRhythm");
    expect(categorize("Deep scroll (>75%)")).toBe("scroll");
    expect(categorize("Sustained reading behavior")).toBe("reading");
    expect(categorize("Very high RTT")).toBe("network");
    expect(categorize("Rage-clicked 3×")).toBe("rageClick");
    expect(categorize("Multi-page navigation")).toBeNull();
  });

  it("diffs default and mutated rules and reports delta+inRange", () => {
    const mutated = mergeRules({ weights: { rageClick: 2 } as never });
    const rows = diffRuleSets(DEFAULT_RULES, mutated);
    const rc = rows.find((r) => r.key === "weights.rageClick");
    expect(rc?.delta).toBe(1);
    expect(rc?.inRange).toBe(true);
  });
});

describe("engine", () => {
  it("with default rules produces the same quality score as production", () => {
    const c = mkClass();
    const r = reclassifyWithRules(c, DEFAULT_RULES);
    expect(r.qualityScore).toBe(c.qualityScore);
    expect(r.humanProbability).toBeCloseTo(c.humanProbability, 5);
  });

  it("amplifying click rhythm penalty drops the quality score", () => {
    const c = mkClass({
      evidence: [
        { signal: "Sustained reading behavior", direction: "positive", weight: 12 },
        { signal: "Robotic click rhythm", direction: "negative", weight: 8 },
      ],
    });
    const boosted = mergeRules({ weights: { clickRhythm: 2 } as never });
    const before = reclassifyWithRules(c, DEFAULT_RULES);
    const after = reclassifyWithRules(c, boosted);
    expect(after.qualityScore).toBeLessThan(before.qualityScore);
    expect(after.affectedEvidenceCount).toBe(1);
  });

  it("thresholds control confidence and risk without touching weights", () => {
    const c = mkClass({
      evidence: [
        { signal: "Bot-like user-agent", direction: "negative", weight: 25 },
        { signal: "Machine-fast interactions", direction: "negative", weight: 20 },
      ],
    });
    const strict = mergeRules({
      thresholds: {
        evidenceHigh: 5,
        evidenceMedium: 2,
        riskEvidenceMin: 5,
        automationHigh: 0.5,
        automationMedium: 0.2,
      } as never,
    });
    const r = reclassifyWithRules(c, strict);
    expect(r.confidence).toBe("high");
    expect(r.riskLevel).toBe("high");
  });
});

describe("simulate + recommend", () => {
  const pop = Array.from({ length: 60 }, (_, i) =>
    mkClass({ session_id: `s-${i}`, humanProbability: 0.8, qualityScore: 70 }),
  );

  it("returns safe-to-deploy for a no-op rule set", () => {
    const result = simulate({ productionClassifications: pop, proposedRules: DEFAULT_RULES });
    expect(result.impact.totalSessions).toBe(60);
    expect(result.recommendation.verdict).toBe("safe-to-deploy");
    expect(result.before.humanPct).toBeCloseTo(result.after.humanPct, 5);
  });

  it("flags deploy-with-caution when many sessions move", () => {
    const rules = mergeRules({ weights: { clickRhythm: 2, reading: 0.2 } as never });
    const result = simulate({ productionClassifications: pop, proposedRules: rules });
    expect(["deploy-with-caution", "reject"]).toContain(result.recommendation.verdict);
    expect(result.impact.overallImpactScore).toBeGreaterThan(0);
  });

  it("returns requires-more-evidence on tiny samples", () => {
    const result = simulate({
      productionClassifications: pop.slice(0, 5),
      proposedRules: DEFAULT_RULES,
    });
    expect(result.recommendation.verdict).toBe("requires-more-evidence");
  });

  it("rejects when regression thresholds are crossed", () => {
    const impact = {
      humansAffected: 20,
      botsAffected: 5,
      highRiskChanged: 4,
      lowRiskChanged: 4,
      confidenceImprovements: 2,
      confidenceDegradations: 40,
      falsePositiveCandidates: 20,
      falseNegativeCandidates: 15,
      segmentMovement: 0,
      overallImpactScore: 0.9,
      totalSessions: 100,
    };
    const before = {
      total: 100,
      humans: 80,
      bots: 20,
      humanPct: 0.8,
      botPct: 0.2,
      avgQuality: 70,
      avgHuman: 0.8,
      confidence: { high: 10, medium: 60, low: 30 },
      risk: { high: 5, medium: 20, low: 75 },
      segments: {},
    };
    const after = { ...before, humans: 40, bots: 60, humanPct: 0.4, botPct: 0.6 };
    expect(recommend(impact, before, after).verdict).toBe("reject");
  });

  it("does not mutate the source classifications", () => {
    const c = mkClass();
    const snapshot = JSON.stringify(c);
    simulate({ productionClassifications: [c], proposedRules: DEFAULT_RULES });
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
