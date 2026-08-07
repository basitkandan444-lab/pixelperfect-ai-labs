// Perceptual color pipeline running in Oklab.
//
// The premium engine applies (in this order):
//   1) Gray-world white balance (constrained so we never over-correct in-scene
//      warm/cool intent — cap the per-channel gain at ±14%).
//   2) CLAHE on the Oklab L channel (adaptive local contrast that lifts shadow
//      detail and micro-contrast without crushing highlights).
//   3) Skin-safe vibrance: multiply Oklab chroma by a factor that decays for
//      hues in the skin cone so faces don't turn orange.
//   4) Gentle S-curve on L to add global contrast without shifting hue.
//
// Everything is pure, deterministic, dependency-free — trivial to unit-test in
// Node without a canvas.

/** Gray-world white balance applied to linear-light RGBA. Returns a new buffer.
 * Gain is capped so a legitimately warm/cool photo isn't neutralised. */
export function grayWorldWhiteBalance(
  rgba: Uint8ClampedArray,
  strength = 0.6,
  maxGain = 0.14,
): Uint8ClampedArray {
  const n = rgba.length / 4;
  let sr = 0,
    sg = 0,
    sb = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sr += rgba[i];
    sg += rgba[i + 1];
    sb += rgba[i + 2];
  }
  const mr = sr / n,
    mg = sg / n,
    mb = sb / n;
  const mean = (mr + mg + mb) / 3;
  if (mean < 1) return rgba.slice(); // black frame
  const clamp = (g: number) => {
    const t = 1 + (g - 1) * strength;
    return Math.max(1 - maxGain, Math.min(1 + maxGain, t));
  };
  const gr = clamp(mean / Math.max(1, mr));
  const gg = clamp(mean / Math.max(1, mg));
  const gb = clamp(mean / Math.max(1, mb));
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = Math.max(0, Math.min(255, rgba[i] * gr));
    out[i + 1] = Math.max(0, Math.min(255, rgba[i + 1] * gg));
    out[i + 2] = Math.max(0, Math.min(255, rgba[i + 2] * gb));
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/** Contrast-Limited Adaptive Histogram Equalization on a scalar plane in
 * [0, 1]. Implements the standard tiled interpolation:
 *   - split the image into `tiles×tiles` blocks
 *   - build a clipped, redistributed CDF per block
 *   - reconstruct each pixel by bilinear interpolation of the four surrounding
 *     block CDFs (so seams vanish)
 *
 * Returns a new Float32Array; the input is not mutated. */
export function claheOnPlane(
  L: Float32Array,
  width: number,
  height: number,
  tiles = 8,
  clipLimit = 2.5,
  bins = 256,
): Float32Array {
  const out = new Float32Array(L.length);
  const tw = Math.max(1, Math.floor(width / tiles));
  const th = Math.max(1, Math.floor(height / tiles));

  // Per-tile mapping table: [tiles*tiles][bins]
  const maps: Float32Array[] = new Array(tiles * tiles);

  for (let ty = 0; ty < tiles; ty++) {
    const y0 = ty * th;
    const y1 = ty === tiles - 1 ? height : (ty + 1) * th;
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * tw;
      const x1 = tx === tiles - 1 ? width : (tx + 1) * tw;
      const hist = new Uint32Array(bins);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = L[y * width + x];
          const b = v <= 0 ? 0 : v >= 1 ? bins - 1 : Math.floor(v * (bins - 1));
          hist[b]++;
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      // Clip and redistribute excess uniformly.
      const clip = Math.max(1, Math.floor((clipLimit * count) / bins));
      let excess = 0;
      for (let b = 0; b < bins; b++) {
        if (hist[b] > clip) {
          excess += hist[b] - clip;
          hist[b] = clip;
        }
      }
      const spread = Math.floor(excess / bins);
      let leftover = excess - spread * bins;
      for (let b = 0; b < bins; b++) {
        hist[b] += spread;
        if (leftover > 0) {
          hist[b]++;
          leftover--;
        }
      }
      // Build the CDF (normalised to [0,1]) as this tile's map.
      const map = new Float32Array(bins);
      let acc = 0;
      const norm = count > 0 ? 1 / count : 0;
      for (let b = 0; b < bins; b++) {
        acc += hist[b];
        map[b] = acc * norm;
      }
      maps[ty * tiles + tx] = map;
    }
  }

  // Reconstruct with bilinear interpolation between the four surrounding tile
  // centres. Centres are placed at (tx+0.5)*tw for interior tiles; edges use
  // the nearest tile so we don't fall off the grid.
  for (let y = 0; y < height; y++) {
    const fy = y / th - 0.5;
    const ty0 = Math.max(0, Math.min(tiles - 1, Math.floor(fy)));
    const ty1 = Math.max(0, Math.min(tiles - 1, ty0 + 1));
    const wy = Math.max(0, Math.min(1, fy - ty0));
    for (let x = 0; x < width; x++) {
      const fx = x / tw - 0.5;
      const tx0 = Math.max(0, Math.min(tiles - 1, Math.floor(fx)));
      const tx1 = Math.max(0, Math.min(tiles - 1, tx0 + 1));
      const wx = Math.max(0, Math.min(1, fx - tx0));

      const v = L[y * width + x];
      const b = v <= 0 ? 0 : v >= 1 ? bins - 1 : Math.floor(v * (bins - 1));
      const m00 = maps[ty0 * tiles + tx0][b];
      const m01 = maps[ty0 * tiles + tx1][b];
      const m10 = maps[ty1 * tiles + tx0][b];
      const m11 = maps[ty1 * tiles + tx1][b];
      const top = m00 * (1 - wx) + m01 * wx;
      const bot = m10 * (1 - wx) + m11 * wx;
      out[y * width + x] = top * (1 - wy) + bot * wy;
    }
  }
  return out;
}

/** Blend two planes: out = a*(1-t) + b*t. */
export function blendPlanes(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * (1 - t) + b[i] * t;
  return out;
}

/** Skin-safe vibrance: boost chroma (a,b in Oklab) by `amount`, but taper the
 * boost near the skin-tone hue axis (Oklab a≈0.06, b≈0.06 roughly). */
export function vibrance(a: Float32Array, b: Float32Array, amount = 0.18): void {
  const skinA = 0.06;
  const skinB = 0.06;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - skinA;
    const db = b[i] - skinB;
    const distSkin = Math.sqrt(da * da + db * db);
    // 1 at the skin locus, decaying to 0 far from it.
    const nearSkin = Math.exp((-distSkin * distSkin) / 0.006);
    const gain = 1 + amount * (1 - 0.7 * nearSkin);
    a[i] *= gain;
    b[i] *= gain;
  }
}

/** Gentle S-curve on the L plane. Preserves midpoint (0.5 -> 0.5). */
export function sCurveL(L: Float32Array, strength = 0.12): void {
  for (let i = 0; i < L.length; i++) {
    const v = L[i];
    // sigmoid-like curve centered at 0.5
    const t = v - 0.5;
    L[i] = Math.max(0, Math.min(1, 0.5 + t + strength * t * (1 - 4 * t * t)));
  }
}

/** Gradient-gated micro-contrast on the L plane: add a portion of (L - blur(L))
 * scaled by local gradient so flats don't ring. `radius` is a small integer. */
export function microContrastL(
  L: Float32Array,
  width: number,
  height: number,
  amount = 0.35,
  radius = 1,
): Float32Array {
  const blur = boxBlur1(L, width, height, radius);
  const out = new Float32Array(L.length);
  for (let y = 0; y < height; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const gx = Math.abs(L[y * width + xp] - L[y * width + xm]);
      const gy = Math.abs(L[yp * width + x] - L[ym * width + x]);
      const gate = Math.min(1, (gx + gy) * 6);
      const detail = L[i] - blur[i];
      out[i] = Math.max(0, Math.min(1, L[i] + amount * gate * detail));
    }
  }
  return out;
}

function boxBlur1(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const win = radius * 2 + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      const outX = Math.min(width - 1, Math.max(0, x - radius));
      const inX = Math.min(width - 1, Math.max(0, x + radius + 1));
      sum += src[row + inX] - src[row + outX];
    }
  }
  // vertical
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++)
      sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / win;
      const outY = Math.min(height - 1, Math.max(0, y - radius));
      const inY = Math.min(height - 1, Math.max(0, y + radius + 1));
      sum += tmp[inY * width + x] - tmp[outY * width + x];
    }
  }
  return out;
}
