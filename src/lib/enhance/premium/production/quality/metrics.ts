// Pixel-quality metrics for verifier + benchmarks. Pure, testable.
// Inputs are RGBA byte buffers of equal length; alpha is ignored.

export function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return 0;
  let sse = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - b[i], dg = a[i + 1] - b[i + 1], db = a[i + 2] - b[i + 2];
    sse += dr * dr + dg * dg + db * db;
    n += 3;
  }
  if (sse === 0) return 99;
  const mse = sse / n;
  return 10 * Math.log10((255 * 255) / mse);
}

/** Fast SSIM approximation (8×8 blocks, luma only). Deterministic. */
export function ssim(
  a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number,
): number {
  if (a.length !== b.length) return 0;
  const block = 8;
  const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2;
  let total = 0, count = 0;
  const luma = (buf: Uint8ClampedArray, i: number) =>
    0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];

  for (let y = 0; y + block <= height; y += block) {
    for (let x = 0; x + block <= width; x += block) {
      let sumA = 0, sumB = 0;
      for (let j = 0; j < block; j++) for (let i = 0; i < block; i++) {
        const idx = ((y + j) * width + (x + i)) * 4;
        sumA += luma(a, idx); sumB += luma(b, idx);
      }
      const n = block * block;
      const muA = sumA / n, muB = sumB / n;
      let varA = 0, varB = 0, cov = 0;
      for (let j = 0; j < block; j++) for (let i = 0; i < block; i++) {
        const idx = ((y + j) * width + (x + i)) * 4;
        const la = luma(a, idx) - muA, lb = luma(b, idx) - muB;
        varA += la * la; varB += lb * lb; cov += la * lb;
      }
      varA /= n; varB /= n; cov /= n;
      const num = (2 * muA * muB + c1) * (2 * cov + c2);
      const den = (muA * muA + muB * muB + c1) * (varA + varB + c2);
      total += num / den; count++;
    }
  }
  return count ? total / count : 1;
}

/** Edge-preservation ratio: fraction of source edges retained (Sobel-magnitude). */
export function edgePreservation(
  a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number,
): number {
  const mag = (buf: Uint8ClampedArray, x: number, y: number) => {
    const at = (dx: number, dy: number) => {
      const idx = ((y + dy) * width + (x + dx)) * 4;
      return 0.2126 * buf[idx] + 0.7152 * buf[idx + 1] + 0.0722 * buf[idx + 2];
    };
    const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
    const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
    return Math.hypot(gx, gy);
  };
  let src = 0, kept = 0;
  const step = 4; // sparse sample
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const ma = mag(a, x, y);
      if (ma > 20) {
        src++;
        if (mag(b, x, y) > ma * 0.5) kept++;
      }
    }
  }
  return src === 0 ? 1 : kept / src;
}
