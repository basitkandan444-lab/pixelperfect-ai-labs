import { describe, expect, it } from "vitest";

import { linearTrend, pearsonCorrelation, zscoreAnomalies } from "./anomaly";

const s = (values: number[]) => values.map((v, i) => ({ ts: `t${i}`, value: v }));

describe("zscoreAnomalies", () => {
  it("returns empty when series shorter than window", () => {
    expect(zscoreAnomalies(s([1, 2, 3]), { window: 5 })).toEqual([]);
  });

  it("flags a clear spike", () => {
    const flat = new Array(20).fill(10);
    flat.push(1000);
    const out = zscoreAnomalies(s(flat), { window: 10, threshold: 3 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1].direction).toBe("spike");
  });

  it("flags a clear drop", () => {
    const flat = new Array(20).fill(10);
    flat.push(-1000);
    const out = zscoreAnomalies(s(flat), { window: 10, threshold: 3 });
    expect(out[out.length - 1].direction).toBe("drop");
  });

  it("ignores constant series (std=0)", () => {
    expect(zscoreAnomalies(s(new Array(30).fill(5)))).toEqual([]);
  });
});

describe("linearTrend", () => {
  it("returns flat for constant series", () => {
    expect(linearTrend(s([5, 5, 5, 5])).direction).toBe("flat");
  });
  it("returns up for strictly increasing series with high r^2", () => {
    const t = linearTrend(s([1, 2, 3, 4, 5]));
    expect(t.direction).toBe("up");
    expect(t.slope).toBeGreaterThan(0);
    expect(t.r_squared).toBeGreaterThan(0.99);
  });
  it("returns down for strictly decreasing series", () => {
    expect(linearTrend(s([5, 4, 3, 2, 1])).direction).toBe("down");
  });
});

describe("pearsonCorrelation", () => {
  it("is 1 for identical series", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 3);
  });
  it("is -1 for inverted series", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 3);
  });
  it("is 0 for uncorrelated series", () => {
    expect(Math.abs(pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4]))).toBeLessThan(1e-9);
  });
});
