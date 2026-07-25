// Premium post-processing pipeline.
//
// Input: the RGBA byte buffer of the fully-upscaled image (from either the
// classical or neural engine). Output: a new RGBA byte buffer with premium
// color, contrast, and detail-recovery applied.
//
// This entire module is pure JS + typed arrays: no DOM, no canvas, no network,
// no ML dependency, no GPU. It runs identically on the main thread, in an
// OffscreenCanvas worker, and under jsdom for unit tests. All work is bounded
// by the pixel count of the final image.

import { bilateralDenoise } from "./bilateral";
import {
  claheOnPlane,
  grayWorldWhiteBalance,
  microContrastL,
  sCurveL,
  vibrance,
} from "./color";
import { oklabPlanesToRgba, rgbaToOklabPlanes } from "./oklab";

export interface PremiumPostOptions {
  /** Overall strength 0..1. 0 = passthrough. Defaults to 1. */
  strength?: number;
  /** Set false to skip the bilateral denoise (expensive on very large images). */
  denoise?: boolean;
  onProgress?: (value: number, message: string) => void;
}

/** Apply the full premium post-pass to an RGBA buffer, returning a new buffer. */
export function applyPremiumPost(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: PremiumPostOptions = {},
): Uint8ClampedArray {
  const s = Math.max(0, Math.min(1, opts.strength ?? 1));
  if (s <= 0) return rgba.slice();
  const onProgress = opts.onProgress;

  onProgress?.(0.05, "Correcting color balance…");
  const wb = grayWorldWhiteBalance(rgba, 0.55 * s);

  let denoised = wb;
  if (opts.denoise ?? true) {
    onProgress?.(0.20, "Reducing noise (edge-preserving)…");
    denoised = bilateralDenoise(wb, width, height, {
      radius: 2,
      sigmaSpatial: 1.6,
      sigmaRange: 20 * s + 6,
    });
  }

  onProgress?.(0.45, "Recovering local contrast…");
  const { L, a, b, alpha } = rgbaToOklabPlanes(denoised, width, height);

  // CLAHE lifts shadow detail + micro-contrast; blend the boosted plane back so
  // we never fully replace the original luminance.
  const claheL = claheOnPlane(L, width, height, 8, 2.2, 256);
  for (let i = 0; i < L.length; i++) L[i] = L[i] * (1 - 0.55 * s) + claheL[i] * (0.55 * s);

  onProgress?.(0.70, "Enhancing texture and edges…");
  const mc = microContrastL(L, width, height, 0.32 * s, 1);
  for (let i = 0; i < L.length; i++) L[i] = mc[i];

  sCurveL(L, 0.10 * s);
  vibrance(a, b, 0.18 * s);

  onProgress?.(0.90, "Finalizing color…");
  const out = oklabPlanesToRgba(L, a, b, alpha, width, height);
  onProgress?.(1.0, "Premium finish complete.");
  return out;
}
