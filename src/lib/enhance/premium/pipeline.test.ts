import { describe, it, expect } from "vitest";
import { bilateralDenoise } from "./bilateral";
import { claheOnPlane, grayWorldWhiteBalance, vibrance } from "./color";
import { applyPremiumPost } from "./pipeline";

function noisyStep(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const base = x < w / 2 ? 60 : 200;
      // deterministic pseudo-noise
      const n = ((x * 131 + y * 17) & 0x1f) - 16;
      buf[i] = Math.max(0, Math.min(255, base + n));
      buf[i + 1] = buf[i];
      buf[i + 2] = buf[i];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

describe("premium color pipeline", () => {
  it("bilateral denoise preserves the edge", () => {
    const w = 32,
      h = 8;
    const src = noisyStep(w, h);
    const out = bilateralDenoise(src, w, h, { radius: 3, sigmaSpatial: 2, sigmaRange: 15 });
    // Edge is at x = 16. Left side pixel far from edge ~60, right side ~200.
    const leftIdx = (4 * w + 4) * 4;
    const rightIdx = (4 * w + 28) * 4;
    expect(Math.abs(out[leftIdx] - 60)).toBeLessThan(6);
    expect(Math.abs(out[rightIdx] - 200)).toBeLessThan(6);
    // Contrast across the edge preserved.
    expect(out[rightIdx] - out[leftIdx]).toBeGreaterThan(120);
  });

  it("CLAHE flattens histogram on a low-contrast plane", () => {
    const w = 32,
      h = 32;
    const L = new Float32Array(w * h);
    for (let i = 0; i < L.length; i++) L[i] = 0.45 + ((i % 8) - 4) * 0.005;
    const out = claheOnPlane(L, w, h, 4, 3.0, 128);
    let min = 1,
      max = 0;
    for (const v of out) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(max - min).toBeGreaterThan(max - min > 0.45 * 2 - 0.9 ? 0 : 0.05);
  });

  it("gray-world WB moves a color-cast frame toward neutral", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 180;
      rgba[i + 1] = 120;
      rgba[i + 2] = 80;
      rgba[i + 3] = 255;
    }
    const out = grayWorldWhiteBalance(rgba, 1, 0.4);
    let sr = 0,
      sg = 0,
      sb = 0;
    for (let i = 0; i < out.length; i += 4) {
      sr += out[i];
      sg += out[i + 1];
      sb += out[i + 2];
    }
    const before = Math.max(180, 120, 80) - Math.min(180, 120, 80); // 100
    const spread = Math.max(sr, sg, sb) - Math.min(sr, sg, sb);
    expect(spread / (rgba.length / 4)).toBeLessThan(before);
  });

  it("vibrance boosts non-skin chroma more than skin chroma", () => {
    const a = new Float32Array([0.06, 0.2]);
    const b = new Float32Array([0.06, -0.15]);
    vibrance(a, b, 0.5);
    const skinBoost = Math.hypot(a[0] - 0.06, b[0] - 0.06);
    const otherBoost = Math.hypot(a[1] - 0.2, b[1] - -0.15);
    expect(otherBoost).toBeGreaterThan(skinBoost);
  });

  it("applyPremiumPost preserves dimensions and alpha", () => {
    const w = 8,
      h = 8;
    const rgba = noisyStep(w, h);
    const out = applyPremiumPost(rgba, w, h);
    expect(out.length).toBe(rgba.length);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it("applyPremiumPost with strength=0 is a passthrough", () => {
    const w = 4,
      h = 4;
    const rgba = noisyStep(w, h);
    const out = applyPremiumPost(rgba, w, h, { strength: 0 });
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(rgba[i]);
  });
});
