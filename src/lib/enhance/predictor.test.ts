import { describe, it, expect } from "vitest";

import {
  predict,
  recordOutcome,
  loadCalibration,
  adjustRemainingMs,
  confidencePercent,
  countTiles,
  stageForProgress,
  stageIndex,
  PROCESSING_STAGES,
  CALIBRATION_KEY,
  type StorageLike,
  type PredictionSignals,
} from "./predictor";

// A tiny in-memory Storage stand-in so calibration tests are hermetic.
function memStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

const baseSignals: PredictionSignals = {
  srcW: 1200,
  srcH: 900,
  scale: "4k",
  engine: "neural",
  tier: "medium",
  warm: true,
};

describe("predict", () => {
  it("returns a calibrated estimate, base, confidence and megapixels", () => {
    const p = predict(baseSignals, memStorage());
    expect(p.estimateMs).toBeGreaterThanOrEqual(1000);
    expect(p.baseMs).toBeGreaterThanOrEqual(1000);
    expect(p.megapixels).toBeCloseTo(1.08, 2);
    expect(p.outputMegapixels).toBeGreaterThan(p.megapixels);
    expect(p.confidence).toBeGreaterThanOrEqual(0.6);
    expect(p.confidence).toBeLessThanOrEqual(0.99);
  });

  it("with no calibration, estimate equals base (factor 1)", () => {
    const p = predict(baseSignals, memStorage());
    expect(p.estimateMs).toBe(Math.max(1000, Math.round(p.baseMs)));
  });

  it("counts neural tiles but reports zero for the classical engine", () => {
    const neural = predict(baseSignals, memStorage());
    const classical = predict({ ...baseSignals, engine: "classical" }, memStorage());
    expect(neural.tiles).toBeGreaterThan(0);
    expect(classical.tiles).toBe(0);
  });

  it("heavier files add a bounded decode overhead to the base", () => {
    const light = predict({ ...baseSignals, fileBytes: 0 }, memStorage());
    const heavy = predict({ ...baseSignals, fileBytes: 12 * 1024 * 1024 }, memStorage());
    expect(heavy.baseMs).toBeGreaterThan(light.baseMs);
    expect(heavy.baseMs - light.baseMs).toBeLessThanOrEqual(600);
  });
});

describe("recordOutcome calibration", () => {
  it("moves the factor toward reality when the model underestimates", () => {
    const storage = memStorage();
    const before = predict(baseSignals, storage);
    // Actual took 2x the base — future estimates should grow.
    recordOutcome({ engine: "neural", baseMs: before.baseMs, actualMs: before.baseMs * 2 }, storage);
    const after = predict(baseSignals, storage);
    expect(after.estimateMs).toBeGreaterThan(before.estimateMs);
  });

  it("raises confidence as accurate samples accumulate", () => {
    const storage = memStorage();
    const start = predict(baseSignals, storage).confidence;
    for (let i = 0; i < 6; i++) {
      const p = predict(baseSignals, storage);
      // Feed near-perfect actuals (matching the calibrated estimate).
      recordOutcome({ engine: "neural", baseMs: p.baseMs, actualMs: p.estimateMs }, storage);
    }
    const end = predict(baseSignals, storage).confidence;
    expect(end).toBeGreaterThan(start);
  });

  it("persists calibration under the versioned key", () => {
    const storage = memStorage();
    recordOutcome({ engine: "neural", baseMs: 5000, actualMs: 6000 }, storage);
    expect(storage.map.has(CALIBRATION_KEY)).toBe(true);
    const store = loadCalibration(storage);
    expect(store.neural?.samples).toBe(1);
  });

  it("calibrates each engine independently", () => {
    const storage = memStorage();
    recordOutcome({ engine: "neural", baseMs: 5000, actualMs: 10000 }, storage);
    const store = loadCalibration(storage);
    expect(store.neural).toBeDefined();
    expect(store.classical).toBeUndefined();
  });

  it("ignores invalid outcomes", () => {
    const storage = memStorage();
    recordOutcome({ engine: "neural", baseMs: 0, actualMs: -5 }, storage);
    expect(loadCalibration(storage).neural).toBeUndefined();
  });

  it("clamps a pathological outlier so it cannot invert the model", () => {
    const storage = memStorage();
    recordOutcome({ engine: "neural", baseMs: 1000, actualMs: 1_000_000 }, storage);
    const store = loadCalibration(storage);
    expect(store.neural?.factor).toBeLessThanOrEqual(3);
  });
});

describe("adjustRemainingMs", () => {
  it("uses the static estimate before enough progress is known", () => {
    const r = adjustRemainingMs({ estimateMs: 20000, elapsedMs: 1000, progress: 0.02 });
    expect(r).toBeGreaterThan(15000);
  });

  it("extends the ETA when a run is running behind schedule", () => {
    // Halfway in elapsed time but only 25% done → projected total ~40s.
    const r = adjustRemainingMs({ estimateMs: 20000, elapsedMs: 10000, progress: 0.25 });
    expect(r).toBeGreaterThan(10000);
  });

  it("never returns zero while real work remains", () => {
    const r = adjustRemainingMs({ estimateMs: 20000, elapsedMs: 60000, progress: 0.9 });
    expect(r).toBeGreaterThan(0);
  });

  it("collapses toward zero as progress completes", () => {
    const r = adjustRemainingMs({ estimateMs: 20000, elapsedMs: 20000, progress: 0.999 });
    expect(r).toBeLessThan(400);
  });
});

describe("confidencePercent", () => {
  it("formats as a whole percentage", () => {
    expect(confidencePercent(0.972)).toBe(97);
    expect(confidencePercent(0.6)).toBe(60);
  });
});

describe("countTiles", () => {
  it("returns zero for invalid dimensions", () => {
    expect(countTiles({ ...baseSignals, srcW: 0, srcH: 0 })).toBe(0);
  });
});

describe("stageForProgress", () => {
  it("maps progress ranges to the five premium stages", () => {
    expect(stageForProgress(0)).toBe("preparing");
    expect(stageForProgress(0.15)).toBe("analysis");
    expect(stageForProgress(0.5)).toBe("enhancement");
    expect(stageForProgress(0.85)).toBe("blending");
    expect(stageForProgress(1)).toBe("finalizing");
  });

  it("stageIndex is ordered and covers all stages", () => {
    for (let i = 0; i < PROCESSING_STAGES.length; i++) {
      expect(stageIndex(PROCESSING_STAGES[i].id)).toBe(i);
    }
  });
});
