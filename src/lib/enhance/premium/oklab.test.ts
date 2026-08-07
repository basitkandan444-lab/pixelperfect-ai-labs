import { describe, it, expect } from "vitest";
import {
  linearRgbToOklab,
  oklabToLinearRgb,
  srgbToLinear01,
  linear01ToSrgb,
  rgbaToOklabPlanes,
  oklabPlanesToRgba,
} from "./oklab";

describe("oklab", () => {
  it("srgb <-> linear round-trips within 1 unit", () => {
    for (const v of [0, 12, 64, 128, 200, 255]) {
      expect(Math.abs(linear01ToSrgb(srgbToLinear01(v)) - v)).toBeLessThanOrEqual(1);
    }
  });

  it("linear rgb <-> oklab round-trips", () => {
    const samples: [number, number, number][] = [
      [0.1, 0.2, 0.3],
      [0.8, 0.5, 0.2],
      [0.5, 0.5, 0.5],
      [0.02, 0.9, 0.4],
    ];
    for (const [r, g, b] of samples) {
      const { L, a, b: bb } = linearRgbToOklab(r, g, b);
      const [r2, g2, b2] = oklabToLinearRgb(L, a, bb);
      expect(Math.abs(r2 - r)).toBeLessThan(1e-4);
      expect(Math.abs(g2 - g)).toBeLessThan(1e-4);
      expect(Math.abs(b2 - b)).toBeLessThan(1e-4);
    }
  });

  it("planar rgba round-trip is visually lossless (<=1 byte per channel)", () => {
    const w = 4,
      h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = (i * 7) & 0xff;
      rgba[i + 1] = (i * 13) & 0xff;
      rgba[i + 2] = (i * 19) & 0xff;
      rgba[i + 3] = 255;
    }
    const { L, a, b, alpha } = rgbaToOklabPlanes(rgba, w, h);
    const out = oklabPlanesToRgba(L, a, b, alpha, w, h);
    for (let i = 0; i < rgba.length; i++) {
      expect(Math.abs(out[i] - rgba[i])).toBeLessThanOrEqual(1);
    }
  });
});
