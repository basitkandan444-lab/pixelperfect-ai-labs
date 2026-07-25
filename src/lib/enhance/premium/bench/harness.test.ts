import { describe, it, expect } from "vitest";
import { benchTransform, psnr, ssimLuma } from "./harness";

function grad(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.round(((x + y) / (w + h - 2)) * 255);
      buf[i] = v; buf[i + 1] = v; buf[i + 2] = v; buf[i + 3] = 255;
    }
  return buf;
}

describe("bench harness", () => {
  it("PSNR of identical buffers is Infinity", () => {
    const a = grad(16, 16);
    expect(psnr(a, a)).toBe(Infinity);
  });

  it("SSIM of identical buffers is ~1", () => {
    const a = grad(16, 16);
    expect(ssimLuma(a, a, 16, 16)).toBeCloseTo(1, 3);
  });

  it("benchTransform reports wall time and metrics", async () => {
    const a = grad(8, 8);
    const r = await benchTransform(a, 8, 8, (b) => b.slice());
    expect(r.psnr).toBe(Infinity);
    expect(r.ssim).toBeCloseTo(1, 3);
    expect(r.wallMs).toBeGreaterThanOrEqual(0);
  });
});
