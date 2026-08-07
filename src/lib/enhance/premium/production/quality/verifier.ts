// Per-stage quality verifier. Compares before/after and flags regressions
// against configurable thresholds. Pure and synchronous.

import { psnr, ssim, edgePreservation } from "./metrics";

export interface QualitySignal {
  psnr: number;
  ssim: number;
  edges: number;
  ok: boolean;
  reasons: string[];
}

export interface QualityThresholds {
  minPSNR?: number;
  minSSIM?: number;
  minEdges?: number;
}

export function verifyStage(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  width: number,
  height: number,
  thresholds: QualityThresholds = {},
): QualitySignal {
  const p = psnr(before, after);
  const s = ssim(before, after, width, height);
  const e = edgePreservation(before, after, width, height);
  const reasons: string[] = [];
  if (thresholds.minPSNR !== undefined && p < thresholds.minPSNR)
    reasons.push(`psnr<${thresholds.minPSNR}`);
  if (thresholds.minSSIM !== undefined && s < thresholds.minSSIM)
    reasons.push(`ssim<${thresholds.minSSIM}`);
  if (thresholds.minEdges !== undefined && e < thresholds.minEdges)
    reasons.push(`edges<${thresholds.minEdges}`);
  return { psnr: p, ssim: s, edges: e, ok: reasons.length === 0, reasons };
}
