import { describe, it, expect } from "vitest";

import { boxBlur, enhancePixels } from "./filters";

// Build a WxH RGBA buffer from a per-pixel gray value function.
function gray(width: number, height: number, fn: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("boxBlur", () => {
  it("smooths a sharp edge (reduces local contrast)", () => {
    const w = 9;
    const h = 1;
    const src = gray(w, h, (x) => (x < 4 ? 0 : 255));
    const out = boxBlur(src, w, h, 1);
    // The pixel straddling the edge should move toward the mean, not stay binary.
    const edge = out[4 * 4];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it("preserves the alpha channel", () => {
    const w = 4;
    const h = 4;
    const src = gray(w, h, () => 120);
    const out = boxBlur(src, w, h, 1);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it("is a no-op passthrough for radius 0", () => {
    const src = gray(3, 3, (x, y) => (x + y) * 10);
    const out = boxBlur(src, 3, 3, 0);
    expect(Array.from(out)).toEqual(Array.from(src));
  });
});

describe("enhancePixels (unsharp mask)", () => {
  it("increases contrast across an edge vs. the source", () => {
    const w = 9;
    const h = 1;
    const src = gray(w, h, (x) => (x < 4 ? 100 : 160));
    const out = enhancePixels(src, w, h, { amount: 1, radius: 1, denoise: 0 });

    const srcContrast = Math.abs(src[4 * 4] - src[3 * 4]);
    const outContrast = Math.abs(out[4 * 4] - out[3 * 4]);
    expect(outContrast).toBeGreaterThanOrEqual(srcContrast);
    // Alpha preserved.
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  // Regression: an interpolated 4× upscale spreads an edge over ~4px. A fixed
  // 1px unsharp radius operates below that scale and is imperceptible; the
  // radius MUST scale with the upscale factor to actually recover detail.
  // This guards against the "visually identical output" bug.
  it("sharpens a factor-scaled soft edge far more with a matched radius", () => {
    // A soft ramp edge ~4px wide (as produced by a 4× interpolated upscale).
    const w = 16;
    const h = 1;
    const ramp = gray(w, h, (x) => {
      if (x <= 6) return 80;
      if (x >= 10) return 180;
      return 80 + ((x - 6) / 4) * 100; // 4px transition
    });
    const gradientAt = (buf: Uint8ClampedArray, x: number) =>
      Math.abs(buf[(x + 1) * 4] - buf[(x - 1) * 4]);

    const small = enhancePixels(ramp, w, h, { amount: 1, radius: 1, denoise: 0 });
    const matched = enhancePixels(ramp, w, h, { amount: 1, radius: 4, denoise: 0 });

    const base = gradientAt(ramp, 8);
    const smallGain = gradientAt(small, 8) - base;
    const matchedGain = gradientAt(matched, 8) - base;

    // The factor-matched radius must produce a substantially stronger edge.
    expect(matchedGain).toBeGreaterThan(smallGain * 2);
  });

  it("returns a copy (does not mutate the source) when amount is 0", () => {
    const src = gray(4, 4, () => 80);
    const out = enhancePixels(src, 4, 4, { amount: 0, radius: 1, denoise: 0 });
    expect(out).not.toBe(src);
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it("denoise smooths a noisy flat region", () => {
    const w = 8;
    const h = 8;
    const src = gray(w, h, (x, y) => ((x + y) % 2 === 0 ? 118 : 138)); // checkerboard noise
    const out = enhancePixels(src, w, h, { amount: 0, radius: 1, denoise: 1 });
    // Variance should drop after denoise.
    const variance = (buf: Uint8ClampedArray) => {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let i = 0; i < buf.length; i += 4) {
        sum += buf[i];
        sumSq += buf[i] * buf[i];
        n++;
      }
      const mean = sum / n;
      return sumSq / n - mean * mean;
    };
    expect(variance(out)).toBeLessThan(variance(src));
  });
});
