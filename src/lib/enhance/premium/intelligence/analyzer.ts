// Fast, deterministic image fingerprinting.
//
// Runs on the RGBA byte buffer we're about to enhance (or a downsample of it).
// All work is O(pixels) with tight inner loops and no allocations beyond a few
// small typed arrays. No DOM, no canvas, no dependency — safe under Node/Vitest.

import type { ImageProfile } from "./plan";

const MAX_ANALYSIS_PIXELS = 512 * 512;

/** Nearest-neighbor downsample of RGBA to a bounded pixel count. Returns the
 * original buffer when already small enough. */
export function downsampleForAnalysis(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const n = width * height;
  if (n <= MAX_ANALYSIS_PIXELS) return { data: rgba, width, height };
  const scale = Math.sqrt(MAX_ANALYSIS_PIXELS / n);
  const w = Math.max(8, Math.floor(width * scale));
  const h = Math.max(8, Math.floor(height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / w));
      const si = (sy * width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Compute the full ImageProfile from an RGBA buffer. Cost is bounded by the
 * MAX_ANALYSIS_PIXELS downsample; call sites don't have to pre-shrink. */
export function analyzeImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  extras: { faces?: number } = {},
): ImageProfile {
  const ds = downsampleForAnalysis(rgba, width, height);
  const buf = ds.data;
  const w = ds.width;
  const h = ds.height;
  const n = w * h;

  let sumR = 0,
    sumG = 0,
    sumB = 0;
  let lowlight = 0;
  let clip = 0;
  let chromaSum = 0;

  // First pass: channel means, luma stats, gamut clipping, chroma proxy.
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i],
      g = buf[i + 1],
      b = buf[i + 2];
    sumR += r;
    sumG += g;
    sumB += b;
    const y = luma(r, g, b);
    if (y < 51) lowlight++;
    if (r === 0 || g === 0 || b === 0 || r === 255 || g === 255 || b === 255) clip++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    chromaSum += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const mr = sumR / n,
    mg = sumG / n,
    mb = sumB / n;
  const meanY = (mr + mg + mb) / 3;

  // Approximate color cast as max channel-mean deviation from grey (0..~40).
  const colorCastLab =
    Math.max(Math.abs(mr - meanY), Math.abs(mg - meanY), Math.abs(mb - meanY)) / 3;

  // Noise proxy: MAD of Laplacian on the luma plane (small window). We reuse
  // the same buffer, no extra allocation of a Y-plane needed.
  let lapSum = 0;
  let lapCount = 0;
  let edgeCount = 0;
  const edgeThreshold = 22;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const yC = luma(buf[i], buf[i + 1], buf[i + 2]);
      const yN = luma(buf[i - w * 4], buf[i - w * 4 + 1], buf[i - w * 4 + 2]);
      const yS = luma(buf[i + w * 4], buf[i + w * 4 + 1], buf[i + w * 4 + 2]);
      const yE = luma(buf[i + 4], buf[i + 5], buf[i + 6]);
      const yW = luma(buf[i - 4], buf[i - 3], buf[i - 2]);
      const lap = Math.abs(4 * yC - yN - yS - yE - yW);
      lapSum += lap;
      lapCount++;
      const grad = Math.abs(yE - yW) + Math.abs(yS - yN);
      if (grad > edgeThreshold) edgeCount++;
    }
  }
  // Scale MAD to a stddev-ish figure. Lap magnitude ~ 4 * sigma for gaussian
  // noise on a flat plane; ÷4 gets us back to an approximate sigma.
  const noiseSigma = lapCount > 0 ? lapSum / lapCount / 4 : 0;

  // JPEG-blockiness: compare mean |dy| across 8-pixel boundaries vs elsewhere.
  let boundaryDiff = 0,
    boundaryCount = 0;
  let interiorDiff = 0,
    interiorCount = 0;
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const j = ((y - 1) * w + x) * 4;
      const d = Math.abs(
        luma(buf[i], buf[i + 1], buf[i + 2]) - luma(buf[j], buf[j + 1], buf[j + 2]),
      );
      if (y % 8 === 0) {
        boundaryDiff += d;
        boundaryCount++;
      } else {
        interiorDiff += d;
        interiorCount++;
      }
    }
  }
  const bMean = boundaryCount ? boundaryDiff / boundaryCount : 0;
  const iMean = interiorCount ? interiorDiff / interiorCount : 0;
  const jpegBlockiness =
    iMean > 0.001 ? Math.max(0, Math.min(1, (bMean - iMean) / (iMean + 4))) : 0;

  return {
    width,
    height,
    megapixels: (width * height) / 1_000_000,
    jpegBlockiness,
    noiseSigma,
    lowlightRatio: lowlight / n,
    colorCastLab,
    chromaMean: chromaSum / n,
    edgeDensity: edgeCount / Math.max(1, (h - 2) * (w - 2)),
    gamutClipPct: clip / n,
    faces: extras.faces,
  };
}
