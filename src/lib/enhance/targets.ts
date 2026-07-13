// Pure target-dimension math for the browser upscaler.
//
// Framework-agnostic and side-effect free so it can be unit-tested directly and
// reused by both the main-thread pipeline and the Web Worker. No canvas, no DOM.

export type Scale = "4k" | "8k";

// The resolution we aim the *long edge* at for each quality tier.
export const TARGET_LONG_EDGE: Record<Scale, number> = {
  "4k": 3840,
  "8k": 7680,
};

// Hard ceilings on the output pixel count. Browser canvases have per-dimension
// and total-area limits (and each RGBA pixel costs 4 bytes of memory during
// processing), so we cap the output to keep the tab well clear of an OOM/GPU
// texture-size failure. Values chosen to stay under the ~16k canvas edge limit
// and to bound peak RAM: an 8K frame is ~33M px ≈ 133MB per RGBA buffer.
export const MAX_OUTPUT_PIXELS: Record<Scale, number> = {
  "4k": 3840 * 2160, // ~8.3M px
  "8k": 7680 * 4320, // ~33.2M px
};

// We never upscale beyond this factor — pushing a tiny thumbnail to 8K produces
// mush, not detail, and wastes memory. Beyond the cap we still upscale, just not
// to the nominal long edge.
export const MAX_UPSCALE_FACTOR: Record<Scale, number> = {
  "4k": 4,
  "8k": 6,
};

export interface TargetDimensions {
  width: number;
  height: number;
  /** Effective linear upscale factor actually applied (>= 1). */
  factor: number;
  /** Number of successive 2x passes the pipeline should use to reach `factor`. */
  passes: number;
}

/**
 * Compute the output dimensions for an upscale, honouring the long-edge target,
 * the max-factor cap and the max-pixel ceiling. Never downscales (factor >= 1).
 */
export function computeTarget(
  width: number,
  height: number,
  scale: Scale,
  opts: { maxPixels?: number } = {},
): TargetDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid source dimensions.");
  }

  const longEdge = Math.max(width, height);
  const nominal = TARGET_LONG_EDGE[scale] / longEdge;

  // Clamp: never below 1 (no downscaling), never above the per-scale cap.
  let factor = Math.min(Math.max(nominal, 1), MAX_UPSCALE_FACTOR[scale]);

  // Enforce the pixel ceiling (a further clamp on the factor).
  const pixelCap = opts.maxPixels ?? MAX_OUTPUT_PIXELS[scale];
  const factorByPixels = Math.sqrt(pixelCap / (width * height));
  if (factorByPixels < factor) factor = Math.max(1, factorByPixels);

  const outW = Math.max(1, Math.round(width * factor));
  const outH = Math.max(1, Math.round(height * factor));

  // Progressive upscaling in ~2x steps preserves far more detail than one big
  // jump. Derive the pass count from the final factor.
  const passes = Math.max(1, Math.ceil(Math.log2(factor <= 1 ? 1.0001 : factor)));

  return { width: outW, height: outH, factor, passes };
}
