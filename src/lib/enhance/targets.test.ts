import { describe, it, expect } from "vitest";

import { computeTarget, MAX_OUTPUT_PIXELS, MAX_UPSCALE_FACTOR, TARGET_LONG_EDGE } from "./targets";

describe("computeTarget", () => {
  it("upscales a small image toward the 4K long-edge target", () => {
    const t = computeTarget(1000, 500, "4k");
    // 3840 / 1000 = 3.84 (under the 4x cap), long edge lands on ~3840.
    expect(t.factor).toBeCloseTo(3.84, 2);
    expect(t.width).toBe(3840);
    expect(t.height).toBe(1920);
    expect(t.passes).toBeGreaterThanOrEqual(2);
  });

  it("never downscales an image already larger than the target", () => {
    const t = computeTarget(6000, 4000, "4k");
    expect(t.factor).toBe(1);
    expect(t.width).toBe(6000);
    expect(t.height).toBe(4000);
  });

  it("clamps the upscale factor to the per-scale cap", () => {
    const t = computeTarget(10, 10, "4k");
    expect(t.factor).toBe(MAX_UPSCALE_FACTOR["4k"]);
    expect(t.width).toBe(120);
  });

  it("reaches the advertised 4K and 8K long edge for normal 16:9 uploads", () => {
    const fourK = computeTarget(640, 360, "4k");
    const eightK = computeTarget(640, 360, "8k");
    expect(fourK.width).toBe(3840);
    expect(fourK.height).toBe(2160);
    expect(eightK.width).toBe(7680);
    expect(eightK.height).toBe(4320);
  });

  it("respects the max-pixel ceiling for 8K", () => {
    const t = computeTarget(4000, 3000, "8k");
    expect(t.width * t.height).toBeLessThanOrEqual(MAX_OUTPUT_PIXELS["8k"] + 4);
  });

  it("uses a larger long-edge target for 8K than 4K", () => {
    expect(TARGET_LONG_EDGE["8k"]).toBeGreaterThan(TARGET_LONG_EDGE["4k"]);
    const a = computeTarget(1000, 1000, "4k");
    const b = computeTarget(1000, 1000, "8k");
    expect(b.factor).toBeGreaterThan(a.factor);
  });

  it("throws on invalid source dimensions", () => {
    expect(() => computeTarget(0, 100, "4k")).toThrow();
    expect(() => computeTarget(100, Number.NaN, "4k")).toThrow();
  });
});
