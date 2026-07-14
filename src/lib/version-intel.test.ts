// Loop 4 — Version Intelligence tests. Pure computations, deterministic.

import { describe, expect, it } from "vitest";

import { DEFAULT_RULES, mergeRules } from "./sandbox/rules";
import type { SimulationEntry } from "./version-intel/compute";
import {
  assessPromotion,
  buildTimeline,
  compareVersions,
  operationalMetrics,
  ruleImpactRows,
  toLeaderboardRows,
  versionSnapshots,
} from "./version-intel/compute";

function mkEntry(overrides: Partial<SimulationEntry> = {}): SimulationEntry {
  return {
    ts: "2026-07-14T10:00:00.000Z",
    simulationId: "sim-1",
    ranAt: "2026-07-14T10:00:00.000Z",
    engineVersion: "3.0.0",
    ruleVersion: "rules-2026.07.14-a",
    modelConfigHash: "abcd1234",
    user: "u1",
    sampleSize: 100,
    durationMs: 42,
    recommendation: "safe-to-deploy",
    before: {
      total: 100,
      humans: 80,
      bots: 20,
      humanPct: 0.8,
      botPct: 0.2,
      avgQuality: 70,
      avgHuman: 0.8,
      confidence: { high: 20, medium: 50, low: 30 },
      risk: { high: 5, medium: 20, low: 75 },
      segments: {},
    },
    after: {
      total: 100,
      humans: 82,
      bots: 18,
      humanPct: 0.82,
      botPct: 0.18,
      avgQuality: 71.5,
      avgHuman: 0.81,
      confidence: { high: 22, medium: 50, low: 28 },
      risk: { high: 4, medium: 20, low: 76 },
      segments: {},
    },
    impact: {
      humansAffected: 2,
      botsAffected: 1,
      highRiskChanged: 1,
      lowRiskChanged: 0,
      confidenceImprovements: 3,
      confidenceDegradations: 1,
      falsePositiveCandidates: 0,
      falseNegativeCandidates: 0,
      segmentMovement: 0,
      overallImpactScore: 0.03,
      totalSessions: 100,
    },
    proposedRules: DEFAULT_RULES,
    ...overrides,
  };
}

describe("versionSnapshots", () => {
  it("aggregates by engineVersion deterministically", () => {
    const e1 = mkEntry({ simulationId: "s1", engineVersion: "3.0.0" });
    const e2 = mkEntry({
      simulationId: "s2",
      engineVersion: "3.0.0",
      ts: "2026-07-14T11:00:00.000Z",
    });
    const e3 = mkEntry({ simulationId: "s3", engineVersion: "4.0.0" });
    const snaps = versionSnapshots([e1, e2, e3]);
    expect(snaps.map((s) => s.engineVersion)).toEqual(["3.0.0", "4.0.0"]);
    expect(snaps[0].simulations).toBe(2);
    expect(snaps[0].sampleTotal).toBe(200);
    // Deterministic — same input produces identical output
    const again = versionSnapshots([e1, e2, e3]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(snaps));
  });

  it("handles empty input", () => {
    expect(versionSnapshots([])).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("computes deltas, polarity, and plain-language summary", () => {
    const snaps = versionSnapshots([
      mkEntry({ engineVersion: "3.0.0" }),
      mkEntry({
        engineVersion: "4.0.0",
        after: {
          total: 100,
          humans: 85,
          bots: 15,
          humanPct: 0.85,
          botPct: 0.15,
          avgQuality: 76,
          avgHuman: 0.83,
          confidence: { high: 40, medium: 40, low: 20 },
          risk: { high: 2, medium: 18, low: 80 },
          segments: {},
        },
      }),
    ]);
    const [base, cand] = snaps;
    const diff = compareVersions(base, cand);
    expect(diff.candidate).toBe("4.0.0");
    const human = diff.metrics.find((m) => m.key === "humanPct")!;
    expect(human.delta).toBeCloseTo(0.03, 5);
    expect(human.polarity).toBe("positive");
    const quality = diff.metrics.find((m) => m.key === "avgQuality")!;
    expect(quality.delta).toBeCloseTo(4.5, 5);
    expect(diff.summary).toContain("4.0.0 vs 3.0.0");
  });
});

describe("assessPromotion", () => {
  it("classifies safe-improvement for tiny movement", () => {
    const a = assessPromotion(mkEntry({ recommendation: "safe-to-deploy" }));
    expect(a.recommendation).toBe("safe-improvement");
    expect(a.reasons.length).toBeGreaterThan(0);
  });
  it("classifies reject verdict as reject", () => {
    const a = assessPromotion(mkEntry({ recommendation: "reject" }));
    expect(a.recommendation).toBe("reject");
  });
  it("flags regression when FP rate exceeds budget", () => {
    const a = assessPromotion(
      mkEntry({
        impact: {
          humansAffected: 0,
          botsAffected: 0,
          highRiskChanged: 0,
          lowRiskChanged: 0,
          confidenceImprovements: 0,
          confidenceDegradations: 0,
          falsePositiveCandidates: 10,
          falseNegativeCandidates: 0,
          segmentMovement: 0,
          overallImpactScore: 0.1,
          totalSessions: 100,
        },
      }),
    );
    expect(a.recommendation).toBe("regression");
  });
  it("needs-review for tiny sample", () => {
    const a = assessPromotion(mkEntry({ recommendation: "requires-more-evidence" }));
    expect(a.recommendation).toBe("needs-review");
  });
});

describe("ruleImpactRows", () => {
  it("returns one row per weight + threshold", () => {
    const rows = ruleImpactRows([mkEntry()]);
    // 10 weights + 7 thresholds
    expect(rows.length).toBe(17);
    for (const r of rows) {
      expect(r.currentWeight).toBeTypeOf("number");
      expect(r.previousWeight).toBeTypeOf("number");
    }
  });
  it("captures previousWeight from earlier simulation", () => {
    const first = mkEntry({
      ts: "2026-07-10T00:00:00.000Z",
      proposedRules: mergeRules({ weights: { clickRhythm: 1.2 } as never }),
    });
    const second = mkEntry({
      ts: "2026-07-14T00:00:00.000Z",
      proposedRules: mergeRules({ weights: { clickRhythm: 1.5 } as never }),
    });
    const rows = ruleImpactRows([first, second]);
    const rr = rows.find((r) => r.ruleKey === "weights.clickRhythm")!;
    expect(rr.currentWeight).toBe(1.5);
    expect(rr.previousWeight).toBe(1.2);
    expect(rr.delta).toBeCloseTo(0.3, 5);
  });
});

describe("buildTimeline", () => {
  it("orders chronologically and labels regressions", () => {
    const entries = [
      mkEntry({ ts: "2026-07-14T10:00Z", simulationId: "a" }),
      mkEntry({
        ts: "2026-07-13T10:00Z",
        simulationId: "b",
        recommendation: "reject",
      }),
    ];
    const t = buildTimeline(entries);
    expect(t[0].simulationId).toBe("b");
    expect(t[0].regression).toBe(true);
    expect(t[1].simulationId).toBe("a");
  });
});

describe("operationalMetrics", () => {
  it("returns zeros for empty input", () => {
    const m = operationalMetrics([]);
    expect(m.totalSimulations).toBe(0);
    expect(m.avgQuality).toBe(0);
  });
  it("computes rates and adoption", () => {
    const m = operationalMetrics([
      mkEntry({ engineVersion: "3.0.0", recommendation: "safe-to-deploy" }),
      mkEntry({ engineVersion: "4.0.0", recommendation: "reject" }),
    ]);
    expect(m.totalSimulations).toBe(2);
    expect(m.simulationSuccessRate).toBeCloseTo(0.5, 5);
    expect(m.versionAdoption.length).toBe(2);
    expect(m.versionAdoption[0].share + m.versionAdoption[1].share).toBeCloseTo(1, 5);
  });
});

describe("toLeaderboardRows", () => {
  it("picks winner=after when quality improves", () => {
    const rows = toLeaderboardRows([mkEntry()]);
    expect(rows[0].winner).toBe("after");
  });
  it("picks winner=tie for negligible movement", () => {
    const rows = toLeaderboardRows([
      mkEntry({
        after: {
          total: 100,
          humans: 80,
          bots: 20,
          humanPct: 0.8,
          botPct: 0.2,
          avgQuality: 70.1,
          avgHuman: 0.8,
          confidence: { high: 20, medium: 50, low: 30 },
          risk: { high: 5, medium: 20, low: 75 },
          segments: {},
        },
      }),
    ]);
    expect(rows[0].winner).toBe("tie");
  });
});

describe("purity guarantees", () => {
  it("compute functions do not mutate their inputs", () => {
    const entries = [mkEntry(), mkEntry({ simulationId: "sim-2" })];
    const snap = JSON.stringify(entries);
    versionSnapshots(entries);
    ruleImpactRows(entries);
    buildTimeline(entries);
    operationalMetrics(entries);
    toLeaderboardRows(entries);
    expect(JSON.stringify(entries)).toBe(snap);
  });
});
