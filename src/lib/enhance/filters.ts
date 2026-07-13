// Pure, dependency-free pixel filters for the browser upscaler.
//
// These operate on plain RGBA `Uint8ClampedArray` buffers (the shape returned by
// `CanvasRenderingContext2D.getImageData().data`) so they are trivially
// unit-testable in Node/jsdom without a real canvas, and identical whether they
// run on the main thread or inside a Web Worker.

/**
 * Separable box blur over the RGB channels (alpha is preserved). Used as the
 * low-pass component of the unsharp mask and, at small radius, as a light
 * noise smoother. Returns a new buffer; the input is not mutated.
 */
export function boxBlur(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius <= 0) return src.slice();
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  const win = radius * 2 + 1;

  // Horizontal pass: src -> tmp
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      // Prime the window with clamped-edge samples.
      for (let k = -radius; k <= radius; k++) {
        const x = Math.min(width - 1, Math.max(0, k));
        sum += src[row + x * 4 + c];
      }
      for (let x = 0; x < width; x++) {
        tmp[row + x * 4 + c] = sum / win;
        const outX = Math.min(width - 1, Math.max(0, x - radius));
        const inX = Math.min(width - 1, Math.max(0, x + radius + 1));
        sum += src[row + inX * 4 + c] - src[row + outX * 4 + c];
      }
    }
    // Copy alpha through.
    for (let x = 0; x < width; x++) tmp[row + x * 4 + 3] = src[row + x * 4 + 3];
  }

  // Vertical pass: tmp -> out
  for (let x = 0; x < width; x++) {
    const col = x * 4;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const y = Math.min(height - 1, Math.max(0, k));
        sum += tmp[y * width * 4 + col + c];
      }
      for (let y = 0; y < height; y++) {
        out[y * width * 4 + col + c] = sum / win;
        const outY = Math.min(height - 1, Math.max(0, y - radius));
        const inY = Math.min(height - 1, Math.max(0, y + radius + 1));
        sum += tmp[inY * width * 4 + col + c] - tmp[outY * width * 4 + col + c];
      }
    }
    for (let y = 0; y < height; y++) out[y * width * 4 + col + 3] = tmp[y * width * 4 + col + 3];
  }

  return out;
}

export interface EnhancePixelOptions {
  /** Unsharp-mask strength. 0 = none, ~0.6 subtle, ~1.2 strong. */
  amount: number;
  /** Blur radius (px) for the mask low-pass. Larger = coarser sharpening. */
  radius: number;
  /** Light denoise strength applied before sharpening. 0 = off. */
  denoise: number;
}

/**
 * Single unsharp-mask pass: out = base + amount * (base - blur(base)).
 * Returns a new buffer; the input is not mutated.
 */
function unsharpMask(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  amount: number,
): Uint8ClampedArray {
  const low = boxBlur(base, width, height, Math.max(1, Math.round(radius)));
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const detail = base[i + c] - low[i + c];
      out[i + c] = base[i + c] + amount * detail;
    }
    out[i + 3] = base[i + 3];
  }
  return out;
}

/**
 * Detail-recovery pass: an optional light denoise, then a two-scale unsharp
 * mask — a coarse pass whose `radius` is matched to the upscale factor (so it
 * actually sharpens the soft edges an interpolated upscale produces) plus a
 * fine radius-1 micro-contrast pass for crispness.
 *
 * Matching the coarse radius to the upscale factor is the critical detail: a
 * fixed 1px radius operates below the interpolation-blur scale of a 4×/8×
 * upscale and produces no perceptible change. Returns a new buffer; the input
 * is not mutated.
 */
export function enhancePixels(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  opts: EnhancePixelOptions,
): Uint8ClampedArray {
  const { amount, radius, denoise } = opts;

  // Light edge-preserving-ish denoise: blend a small blur back in at low weight
  // so flat noisy regions smooth out without destroying edges.
  let base = src;
  if (denoise > 0) {
    const smoothed = boxBlur(src, width, height, 1);
    base = new Uint8ClampedArray(src.length);
    const w = Math.min(1, Math.max(0, denoise));
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) base[i + c] = src[i + c] * (1 - w) + smoothed[i + c] * w;
      base[i + 3] = src[i + 3];
    }
  }

  if (amount <= 0) return base === src ? src.slice() : base;

  // Coarse pass at the interpolation-blur scale, then a fine micro-contrast pass.
  const coarse = unsharpMask(base, width, height, radius, amount);
  return unsharpMask(coarse, width, height, 1, amount * 0.5);
}
