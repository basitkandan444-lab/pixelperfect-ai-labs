// Bench harness: image-quality + wall-time metrics for the premium pipeline.
//
// Pure JS, no browser dependency; runs under Vitest and can be driven by a CLI
// script for regression tracking. Only implements the pieces we actually
// verify against — PSNR, SSIM, and a wall-clock measurement.

export function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error("PSNR: length mismatch");
  let mse = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - b[i],
      dg = a[i + 1] - b[i + 1],
      db = a[i + 2] - b[i + 2];
    mse += dr * dr + dg * dg + db * db;
    n += 3;
  }
  if (n === 0) return Infinity;
  mse /= n;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/** Simple mean-based single-window SSIM on the luma plane (K1=0.01, K2=0.03).
 * Good enough for regression tracking, not a general-purpose SSIM. */
export function ssimLuma(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (a.length !== b.length) throw new Error("SSIM: length mismatch");
  const n = width * height;
  const yA = new Float32Array(n);
  const yB = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    yA[p] = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    yB[p] = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
  }
  let muA = 0,
    muB = 0;
  for (let i = 0; i < n; i++) {
    muA += yA[i];
    muB += yB[i];
  }
  muA /= n;
  muB /= n;
  let vA = 0,
    vB = 0,
    cov = 0;
  for (let i = 0; i < n; i++) {
    const da = yA[i] - muA,
      db = yB[i] - muB;
    vA += da * da;
    vB += db * db;
    cov += da * db;
  }
  vA /= n;
  vB /= n;
  cov /= n;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * muA * muB + c1) * (2 * cov + c2)) / ((muA * muA + muB * muB + c1) * (vA + vB + c2));
}

export interface BenchResult {
  psnr: number;
  ssim: number;
  wallMs: number;
}

/** Time-and-measure a transform against the identity reference. */
export async function benchTransform(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  transform: (b: Uint8ClampedArray) => Promise<Uint8ClampedArray> | Uint8ClampedArray,
): Promise<BenchResult> {
  const t0 = performance.now();
  const out = await transform(input);
  const wallMs = performance.now() - t0;
  return { psnr: psnr(input, out), ssim: ssimLuma(input, out, width, height), wallMs };
}
