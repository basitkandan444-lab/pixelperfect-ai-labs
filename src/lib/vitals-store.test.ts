import { describe, expect, it } from "vitest";

import { ratingFor, vitals, VITAL_NAMES } from "@/lib/vitals-store";

// The vitals store is a per-isolate singleton, so tests assert on deltas and
// invariants rather than absolute totals. It backs the performance dashboard: a
// broken aggregation silently hides a real user-experience regression.

describe("vitals-store", () => {
  it("classifies values against Core Web Vitals thresholds", () => {
    expect(ratingFor("LCP", 2000)).toBe("good");
    expect(ratingFor("LCP", 3000)).toBe("needs-improvement");
    expect(ratingFor("LCP", 5000)).toBe("poor");
    expect(ratingFor("CLS", 0.05)).toBe("good");
    expect(ratingFor("CLS", 0.3)).toBe("poor");
  });

  it("records samples and increments the matching rating bucket", () => {
    const before = vitals.snapshot();
    vitals.record({ name: "LCP", value: 1000 }); // good
    vitals.record({ name: "LCP", value: 6000 }); // poor
    const after = vitals.snapshot();
    expect(after.metrics.LCP.count - before.metrics.LCP.count).toBe(2);
    expect(after.metrics.LCP.good - before.metrics.LCP.good).toBe(1);
    expect(after.metrics.LCP.poor - before.metrics.LCP.poor).toBe(1);
    expect(after.samples - before.samples).toBe(2);
  });

  it("honors an explicit client-provided rating over the threshold default", () => {
    const before = vitals.snapshot();
    // A value that would auto-classify as "good", forced to "poor".
    vitals.record({ name: "INP", value: 10, rating: "poor" });
    const after = vitals.snapshot();
    expect(after.metrics.INP.poor - before.metrics.INP.poor).toBe(1);
  });

  it("ignores invalid names and non-finite / negative values", () => {
    const before = vitals.snapshot();
    // @ts-expect-error — intentionally invalid metric name.
    vitals.record({ name: "BOGUS", value: 100 });
    vitals.record({ name: "TTFB", value: Number.NaN });
    vitals.record({ name: "TTFB", value: -5 });
    const after = vitals.snapshot();
    expect(after.samples).toBe(before.samples);
  });

  it("exposes a summary for every known vital", () => {
    const snap = vitals.snapshot();
    for (const name of VITAL_NAMES) {
      expect(snap.metrics[name]).toBeDefined();
      expect(snap.metrics[name].p75).toBeGreaterThanOrEqual(0);
    }
    expect(() => new Date(snap.since).toISOString()).not.toThrow();
  });
});
