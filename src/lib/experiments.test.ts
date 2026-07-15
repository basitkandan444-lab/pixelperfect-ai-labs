import { describe, expect, it } from "vitest";

import {
  assignVariant,
  hash32,
  normalCdf,
  summarizeExperiments,
  twoProportionPValue,
} from "./experiments";

describe("hash32", () => {
  it("is deterministic and stable across calls", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
  });
});

describe("assignVariant", () => {
  it("returns the same variant for the same session", () => {
    const vs = [{ id: "A" }, { id: "B" }];
    const first = assignVariant("exp-1", "sess-42", vs);
    for (let i = 0; i < 10; i++) expect(assignVariant("exp-1", "sess-42", vs)).toBe(first);
  });

  it("splits roughly evenly at scale with equal weights", () => {
    const vs = [{ id: "A" }, { id: "B" }];
    let a = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (assignVariant("exp-x", `s${i}`, vs) === "A") a += 1;
    expect(Math.abs(a / N - 0.5)).toBeLessThan(0.05);
  });

  it("respects weights", () => {
    const vs = [{ id: "A", weight: 9 }, { id: "B", weight: 1 }];
    let a = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (assignVariant("exp-w", `s${i}`, vs) === "A") a += 1;
    expect(a / N).toBeGreaterThan(0.85);
  });

  it("throws on empty variants", () => {
    expect(() => assignVariant("e", "s", [])).toThrow();
  });
});

describe("normalCdf", () => {
  it("is 0.5 at 0 and monotonic", () => {
    expect(Math.abs(normalCdf(0) - 0.5)).toBeLessThan(1e-6);
    expect(normalCdf(1)).toBeGreaterThan(normalCdf(0));
    expect(normalCdf(-1)).toBeLessThan(normalCdf(0));
  });
});

describe("twoProportionPValue", () => {
  it("returns null for empty arms", () => {
    expect(twoProportionPValue(0, 0, 1, 10)).toBeNull();
  });
  it("returns high p when arms are identical", () => {
    const p = twoProportionPValue(10, 100, 10, 100)!;
    expect(p).toBeGreaterThan(0.9);
  });
  it("returns low p for a clearly-different arm", () => {
    const p = twoProportionPValue(10, 1000, 100, 1000)!;
    expect(p).toBeLessThan(0.001);
  });
});

describe("summarizeExperiments", () => {
  it("aggregates exposures/conversions per (experiment, variant) uniquely by session", () => {
    const rows = [
      { session_id: "s1", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } },
      { session_id: "s1", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } }, // dupe
      { session_id: "s2", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } },
      { session_id: "s2", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "A" } },
      { session_id: "s3", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "B" } },
      { session_id: "s4", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "B" } },
      { session_id: "s3", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "B" } },
      { session_id: "s4", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "B" } },
    ];
    const [s] = summarizeExperiments(rows);
    expect(s.experiment_id).toBe("e");
    const a = s.variants.find((v) => v.variant === "A")!;
    const b = s.variants.find((v) => v.variant === "B")!;
    expect(a.exposures).toBe(2);
    expect(a.conversions).toBe(1);
    expect(b.exposures).toBe(2);
    expect(b.conversions).toBe(2);
    expect(b.lift_vs_control).toBeGreaterThan(0);
  });

  it("ignores events without experiment_id or variant", () => {
    const rows = [
      { session_id: "s1", name: "experiment_exposure", ts: "", metrics: null },
      { session_id: "s1", name: "page_view", ts: "", metrics: { experiment_id: "e", variant: "A" } },
    ];
    const out = summarizeExperiments(rows);
    expect(out).toEqual([]);
  });
});
