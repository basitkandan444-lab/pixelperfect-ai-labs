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
    const vs = [{ id: "A", is_control: true }, { id: "B" }];
    const first = assignVariant("exp-1", "sess-42", vs);
    for (let i = 0; i < 10; i++) expect(assignVariant("exp-1", "sess-42", vs)).toBe(first);
  });

  it("splits roughly evenly at scale with equal weights", () => {
    const vs = [{ id: "A", is_control: true }, { id: "B" }];
    let a = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) if (assignVariant("exp-x", `s${i}`, vs) === "A") a += 1;
    expect(Math.abs(a / N - 0.5)).toBeLessThan(0.05);
  });

  it("respects weights", () => {
    const vs = [{ id: "A", weight: 9, is_control: true }, { id: "B", weight: 1 }];
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

describe("summarizeExperiments (declared control)", () => {
  const rows = [
    { session_id: "s1", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } },
    { session_id: "s2", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } },
    { session_id: "s2", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "A" } },
    { session_id: "s3", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "B" } },
    { session_id: "s4", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "B" } },
    { session_id: "s3", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "B" } },
    { session_id: "s4", name: "experiment_conversion", ts: "", metrics: { experiment_id: "e", variant: "B" } },
  ];

  it("computes lift vs the DECLARED control, not alphabetic first", () => {
    // Declare B as control (alphabetically second) — lift must be for A vs B, not B vs A.
    const [s] = summarizeExperiments(rows, [
      { id: "e", variants: [{ id: "A" }, { id: "B", is_control: true }] },
    ]);
    expect(s.control_variant).toBe("B");
    const b = s.variants.find((v) => v.variant === "B")!;
    const a = s.variants.find((v) => v.variant === "A")!;
    expect(b.is_control).toBe(true);
    expect(a.is_control).toBe(false);
    expect(b.lift_vs_control).toBeNull(); // control has no lift-vs-self
    expect(a.lift_vs_control).toBeLessThan(0); // A converts less than B here
  });

  it("falls back to first-seen variant only when no definition is provided", () => {
    const [s] = summarizeExperiments(rows);
    expect(s.control_variant).toBe("A");
    const a = s.variants.find((v) => v.variant === "A")!;
    expect(a.is_control).toBe(true);
  });

  it("uniquely counts exposures/conversions per session per variant", () => {
    const dupes = [
      ...rows,
      { session_id: "s1", name: "experiment_exposure", ts: "", metrics: { experiment_id: "e", variant: "A" } }, // dupe
    ];
    const [s] = summarizeExperiments(dupes, [
      { id: "e", variants: [{ id: "A", is_control: true }, { id: "B" }] },
    ]);
    const a = s.variants.find((v) => v.variant === "A")!;
    expect(a.exposures).toBe(2); // s1, s2 — not 3
  });

  it("ignores events without experiment_id or variant", () => {
    const noise = [
      { session_id: "s1", name: "experiment_exposure", ts: "", metrics: null },
      { session_id: "s1", name: "page_view", ts: "", metrics: { experiment_id: "e", variant: "A" } },
    ];
    const out = summarizeExperiments(noise);
    expect(out).toEqual([]);
  });
});
