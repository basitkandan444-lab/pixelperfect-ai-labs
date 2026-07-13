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
 * Detail-recovery pass: an optional light denoise followed by an unsharp mask.
 *
 * out = base + amount * (base - blur(base))
 *
 * where `base` is the (optionally denoised) source. This is the classic,
 * artifact-free way to recover perceived sharpness after an interpolated
 * upscale. Returns a new buffer; the input is not mutated.
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

  const low = boxBlur(base, width, height, Math.max(1, Math.round(radius)));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const detail = base[i + c] - low[i + c];
      out[i + c] = base[i + c] + amount * detail;
    }
    out[i + 3] = base[i + 3];
  }
  return out;
}
