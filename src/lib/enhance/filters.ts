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
  /** Unsharp/detail-recovery strength. 0 = none, ~1 subtle, ~2+ strong. */
  amount: number;
  /** Blur radius (px) for the mask low-pass. Larger = coarser sharpening. */
  radius: number;
  /** Light denoise strength applied before sharpening. 0 = off. */
  denoise: number;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function lumaAt(buf: Uint8ClampedArray, index: number): number {
  return buf[index] * 0.2126 + buf[index + 1] * 0.7152 + buf[index + 2] * 0.0722;
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
      out[i + c] = clampByte(base[i + c] + amount * detail);
    }
    out[i + 3] = base[i + 3];
  }
  return out;
}

/**
 * Denoise only low-gradient regions. A plain blur makes already-soft uploads
 * even softer; this keeps edges intact while calming flat compression/noise.
 */
function edgeAwareDenoise(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  if (amount <= 0) return src;
  const blurred = boxBlur(src, width, height, 1);
  const out = new Uint8ClampedArray(src.length);
  const strength = Math.min(1, Math.max(0, amount));

  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const i = (y * width + x) * 4;
      const gx = Math.abs(lumaAt(src, (y * width + xp) * 4) - lumaAt(src, (y * width + xm) * 4));
      const gy = Math.abs(lumaAt(src, (yp * width + x) * 4) - lumaAt(src, (ym * width + x) * 4));
      const edge = Math.min(1, (gx + gy) / 42);
      const w = strength * (1 - edge);
      for (let c = 0; c < 3; c++) out[i + c] = src[i + c] * (1 - w) + blurred[i + c] * w;
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

/**
 * A controlled 3×3 Laplacian edge pass. This is what makes the result visibly
 * different at preview size: it restores edge slope after resampling, but gates
 * the boost by local gradient so flat noise is not amplified into speckles.
 */
function edgeCrispen(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): Uint8ClampedArray {
  if (strength <= 0) return src.slice();
  const out = new Uint8ClampedArray(src.length);
  const s = Math.min(0.85, Math.max(0, strength));

  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const i = (y * width + x) * 4;
      const li = (y * width + xm) * 4;
      const ri = (y * width + xp) * 4;
      const ui = (ym * width + x) * 4;
      const di = (yp * width + x) * 4;
      const gx = Math.abs(lumaAt(src, ri) - lumaAt(src, li));
      const gy = Math.abs(lumaAt(src, di) - lumaAt(src, ui));
      const gate = Math.min(1, Math.max(0, (gx + gy - 4) / 26));
      const boost = s * gate;

      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        const lap = 4 * center - src[li + c] - src[ri + c] - src[ui + c] - src[di + c];
        out[i + c] = clampByte(center + boost * lap);
      }
      out[i + 3] = src[i + 3];
    }
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

  const base = edgeAwareDenoise(src, width, height, denoise);

  if (amount <= 0) return base === src ? src.slice() : base;

  // Coarse pass at the interpolation-blur scale, a smaller mid-scale pass for
  // compression-smear recovery, then a fine edge pass for visible preview-size
  // crispness. This is intentionally stronger than a photo-editor default
  // because the product promise is enhancement/upscaling, not a neutral resize.
  const coarse = unsharpMask(base, width, height, radius, amount);
  const mid = unsharpMask(
    coarse,
    width,
    height,
    Math.max(1, Math.round(radius / 3)),
    amount * 0.55,
  );
  const fine = unsharpMask(mid, width, height, 1, amount * 0.3);
  return edgeCrispen(fine, width, height, 0.18 + amount * 0.14 + Math.min(radius, 12) * 0.018);
}
