import { describe, it, expect } from "vitest";
import { analyzeImage, downsampleForAnalysis } from "./analyzer";

function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

function stepEdge(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x < w / 2 ? 40 : 210;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = 255;
    }
  return buf;
}

describe("analyzer", () => {
  it("downsampleForAnalysis returns original when small enough", () => {
    const src = solid(16, 16, 128, 128, 128);
    const ds = downsampleForAnalysis(src, 16, 16);
    expect(ds.width).toBe(16);
    expect(ds.data).toBe(src);
  });

  it("downsampleForAnalysis shrinks huge images", () => {
    const src = solid(1024, 1024, 128, 128, 128);
    const ds = downsampleForAnalysis(src, 1024, 1024);
    expect(ds.width * ds.height).toBeLessThanOrEqual(512 * 512);
  });

  it("detects a dark image as lowlight", () => {
    const p = analyzeImage(solid(32, 32, 20, 20, 20), 32, 32);
    expect(p.lowlightRatio).toBeGreaterThan(0.9);
    expect(p.chromaMean).toBeLessThan(0.05);
  });

  it("detects a warm color cast", () => {
    const p = analyzeImage(solid(32, 32, 200, 130, 60), 32, 32);
    expect(p.colorCastLab).toBeGreaterThan(3);
  });

  it("detects strong edges on a step image", () => {
    const p = analyzeImage(stepEdge(64, 16), 64, 16);
    expect(p.edgeDensity).toBeGreaterThan(0);
  });

  it("preserves image dimensions in the profile", () => {
    const p = analyzeImage(solid(40, 30, 100, 100, 100), 40, 30);
    expect(p.width).toBe(40);
    expect(p.height).toBe(30);
    expect(p.megapixels).toBeCloseTo(0.0012, 3);
  });
});
