import { describe, expect, it } from "vitest";
import { runEvolution } from "./engine";
import type { EvolutionInputs } from "./types";

const NOW = "2026-01-01T00:00:00.000Z";

function base(overrides: Partial<EvolutionInputs> = {}): EvolutionInputs {
  return { window: "7d", now: NOW, ...overrides };
}

describe("evolution engine", () => {
  it("returns empty on empty inputs", () => {
    expect(runEvolution(base())).toEqual([]);
  });

  it("flags upgrade-wall abandonment above threshold", () => {
    const recs = runEvolution(
      base({
        conversion: {
          uploads: 100,
          enhancements: 100,
          downloads: 80,
          wallHits: 100,
          wallAbandons: 80,
          checkoutStarted: 5,
          checkoutCompleted: 3,
        },
      }),
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].category).toBe("conversion");
    expect(recs[0].severity).toBe("critical");
  });

  it("flags free-chunk leak with critical severity", () => {
    const recs = runEvolution(
      base({
        bundle: { freeChunkDeltaBytes: 128, premiumChunkBytes: 100, premiumChunkBudgetBytes: 200 },
      }),
    );
    expect(recs.some((r) => r.subject === "bundle:free" && r.severity === "critical")).toBe(true);
  });

  it("recommends expanding a high-attribution capability", () => {
    const recs = runEvolution(
      base({
        capabilityUsage: [
          { id: "faceRestore", runs: 100, upgradeAttributions: 60, completionRate: 0.9 },
        ],
      }),
    );
    expect(
      recs.some((r) => r.subject === "capability:faceRestore" && r.title.includes("expand")),
    ).toBe(true);
  });

  it("is deterministic and dedupes by stable id", () => {
    const inputs = base({
      conversion: {
        uploads: 100,
        enhancements: 100,
        downloads: 20,
        wallHits: 100,
        wallAbandons: 80,
        checkoutStarted: 5,
        checkoutCompleted: 3,
      },
      bundle: { freeChunkDeltaBytes: 10, premiumChunkBytes: 0, premiumChunkBudgetBytes: 0 },
    });
    const a = runEvolution(inputs);
    const b = runEvolution(inputs);
    expect(a).toEqual(b);
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
    // critical first
    expect(a[0].severity).toBe("critical");
  });

  it("sorts by severity then id", () => {
    const recs = runEvolution(
      base({
        conversion: {
          uploads: 100,
          enhancements: 100,
          downloads: 20,
          wallHits: 100,
          wallAbandons: 60,
          checkoutStarted: 5,
          checkoutCompleted: 3,
        }, // warn
        bundle: { freeChunkDeltaBytes: 100, premiumChunkBytes: 0, premiumChunkBudgetBytes: 0 }, // critical
      }),
    );
    expect(recs[0].severity).toBe("critical");
  });
});
