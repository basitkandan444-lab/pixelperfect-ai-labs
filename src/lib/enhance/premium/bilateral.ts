// Edge-preserving denoise (separable bilateral approximation).
//
// A full 2D bilateral filter is O(r²) per pixel; the separable H+V approximation
// is O(r) with very close visual quality on natural images. Range weight uses
// the luma difference in [0,255] so the same `sigmaRange` value behaves the
// same across images.

function gauss(x: number, sigma: number): number {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

function lumaAt(buf: Uint8ClampedArray, i: number): number {
  return buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722;
}

/** Single-axis bilateral pass. `axis` is "x" or "y". Returns a new buffer. */
function bilateralAxis(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  sigmaSpatial: number,
  sigmaRange: number,
  axis: "x" | "y",
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const spatialW: number[] = [];
  for (let k = -radius; k <= radius; k++) spatialW.push(gauss(k, sigmaSpatial));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const centerL = lumaAt(src, i);
      let wSum = 0;
      let rSum = 0, gSum = 0, bSum = 0;
      for (let k = -radius; k <= radius; k++) {
        let nx = x, ny = y;
        if (axis === "x") nx = Math.min(width - 1, Math.max(0, x + k));
        else ny = Math.min(height - 1, Math.max(0, y + k));
        const ni = (ny * width + nx) * 4;
        const nL = lumaAt(src, ni);
        const w = spatialW[k + radius] * gauss(nL - centerL, sigmaRange);
        wSum += w;
        rSum += w * src[ni];
        gSum += w * src[ni + 1];
        bSum += w * src[ni + 2];
      }
      out[i] = Math.round(rSum / wSum);
      out[i + 1] = Math.round(gSum / wSum);
      out[i + 2] = Math.round(bSum / wSum);
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

/** Edge-preserving denoise. Larger `sigmaRange` = smoother; larger
 * `sigmaSpatial` = wider blur. Defaults are tuned for JPEG photos. */
export function bilateralDenoise(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  {
    radius = 2,
    sigmaSpatial = 1.6,
    sigmaRange = 22,
  }: { radius?: number; sigmaSpatial?: number; sigmaRange?: number } = {},
): Uint8ClampedArray {
  const h = bilateralAxis(src, width, height, radius, sigmaSpatial, sigmaRange, "x");
  return bilateralAxis(h, width, height, radius, sigmaSpatial, sigmaRange, "y");
}
