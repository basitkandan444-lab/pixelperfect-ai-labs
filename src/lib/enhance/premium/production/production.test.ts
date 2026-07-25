import { describe, it, expect } from "vitest";
import { psnr, ssim, edgePreservation } from "./quality/metrics";
import { verifyStage } from "./quality/verifier";
import { runGate, checks } from "./verification/gate";
import { CostPredictor } from "./performance/predictor";
import { Profiler } from "./performance/profiler";
import { adviseWithinBudget } from "./optimization/advisor";
import { benchmarkCapability } from "./benchmarks/runner";
import { record, snapshot, clear } from "./telemetry/collector";
import { buildFinalScore } from "./telemetry/report";
import { aggregateStages } from "./analytics/aggregate";
import { gatePlan } from "./compatibility/policy";
import { checkFreeChunk, checkPremiumBudget } from "./bundle/guard";
import type { PremiumPlan } from "../intelligence/plan";
import type { FeatureFlag } from "../capabilities/types";
import "../capabilities/builtins";

function solidRGBA(w: number, h: number, r = 128, g = 128, b = 128): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) { a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; }
  return a;
}

describe("quality metrics", () => {
  it("psnr is high for identical buffers", () => {
    const a = solidRGBA(16, 16);
    expect(psnr(a, a)).toBeGreaterThanOrEqual(99);
  });
  it("ssim ~1 for identical", () => {
    const a = solidRGBA(16, 16);
    expect(ssim(a, a, 16, 16)).toBeCloseTo(1, 5);
  });
  it("edge preservation is 1 when identical", () => {
    const a = solidRGBA(16, 16);
    expect(edgePreservation(a, a, 16, 16)).toBe(1);
  });
});

describe("verifier", () => {
  it("passes when identical", () => {
    const a = solidRGBA(16, 16);
    const r = verifyStage(a, a, 16, 16, { minPSNR: 40, minSSIM: 0.9 });
    expect(r.ok).toBe(true);
  });
});

describe("gate", () => {
  it("aggregates checks into a report", async () => {
    const report = await runGate([
      checks.architecture(true),
      checks.memory(50, 100),
      checks.bundle(100, 200),
      checks.browser(new Set(["a"]), ["a"]),
    ]);
    expect(report.status).toBe("pass");
    expect(report.score).toBe(100);
  });
});

describe("predictor + profiler + advisor", () => {
  it("predictor smooths with EMA", () => {
    const p = new CostPredictor(0.5);
    p.observe("x", 100, 2);
    p.observe("x", 200, 2);
    expect(p.msPerMP("x")).toBeGreaterThan(50);
  });
  it("profiler times sync work", () => {
    const p = new Profiler();
    p.start();
    p.time("s", () => { for (let i = 0; i < 1000; i++); });
    expect(p.snapshot()).toHaveLength(1);
  });
  it("advisor respects budget", () => {
    const plan: PremiumPlan = {
      stages: ["deblock", "bilateral", "clahe"],
      params: {}, backend: "js", modelIds: [],
      weights: { deblock: 0.3, bilateral: 0.4, clahe: 0.3 },
      reasons: [],
    };
    const pred = new CostPredictor();
    pred.observe("deblock", 10, 1);
    pred.observe("bilateral", 100, 1);
    pred.observe("clahe", 20, 1);
    const a = adviseWithinBudget(plan, 1, 40, pred);
    expect(a.keep).toContain("deblock");
    expect(a.drop).toContain("bilateral");
  });
});

describe("benchmark runner", () => {
  it("flags too-slow runs", () => {
    const a = solidRGBA(64, 64);
    const r = benchmarkCapability({
      id: "deblock", backend: "js", before: a, after: a,
      width: 64, height: 64, ms: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(",")).toMatch(/ms\/MP/);
  });
});

describe("telemetry", () => {
  it("records and produces a final score", () => {
    clear();
    const runId = "r1";
    record({ runId, kind: "stage", data: { id: "deblock", ms: 4 } });
    record({ runId, kind: "stage", data: { id: "clahe", ms: 6 } });
    record({ runId, kind: "run", data: { backend: "js", compat: ["canvas2d"], skipped: [] } });
    const fs = buildFinalScore(runId, snapshot());
    expect(fs.totalMs).toBe(10);
    expect(fs.backend).toBe("js");
  });
});

describe("aggregate", () => {
  it("computes averages", () => {
    clear();
    record({ runId: "a", kind: "stage", data: { id: "x", ms: 10 } });
    record({ runId: "b", kind: "stage", data: { id: "x", ms: 30 } });
    const agg = aggregateStages(snapshot());
    expect(agg[0].avgMs).toBe(20);
  });
});

describe("compat policy", () => {
  it("drops stages missing required features", () => {
    const plan: PremiumPlan = {
      stages: ["deblock", "faceRestore"],
      params: {}, backend: "js", modelIds: [],
      weights: { deblock: 0.5, faceRestore: 0.5 },
      reasons: [],
    };
    const avail = new Set<FeatureFlag>(["canvas2d"]);
    const r = gatePlan(plan, avail);
    expect(r.plan.stages).toEqual(["deblock"]);
    expect(r.removed).toEqual(["faceRestore"]);
    expect(r.plan.weights.deblock).toBeCloseTo(1);
  });
});

describe("bundle guard", () => {
  it("catches premium leakage into free chunk", () => {
    const r = checkFreeChunk("some code that imports premium/pipeline directly");
    expect(r.ok).toBe(false);
  });
  it("passes clean free chunk", () => {
    expect(checkFreeChunk("nothing here").ok).toBe(true);
  });
  it("enforces premium budget", () => {
    expect(checkPremiumBudget(1000, 500).ok).toBe(false);
    expect(checkPremiumBudget(1000, 5000).ok).toBe(true);
  });
});
