// Per-capability benchmark runner. Wraps the existing bench harness with the
// registry's descriptors so future capabilities inherit benchmarking for free.

import { getCapability } from "../../capabilities/registry";
import type { PremiumBackend } from "../../intelligence/plan";
import { BENCH_THRESHOLDS } from "./thresholds";
import { psnr, ssim } from "../quality/metrics";

export interface CapabilityBenchInput {
  id: string;
  backend: PremiumBackend;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
  width: number;
  height: number;
  ms: number;
}

export interface CapabilityBenchResult {
  id: string;
  backend: PremiumBackend;
  psnr: number;
  ssim: number;
  msPerMP: number;
  ok: boolean;
  reasons: string[];
}

export function benchmarkCapability(input: CapabilityBenchInput): CapabilityBenchResult {
  const megapixels = Math.max(1, (input.width * input.height) / 1_000_000);
  const p = psnr(input.before, input.after);
  const s = ssim(input.before, input.after, input.width, input.height);
  const perMP = input.ms / megapixels;
  const t = BENCH_THRESHOLDS[input.id] ?? getCapability(input.id)?.bench;
  const reasons: string[] = [];
  if (t?.minPSNR !== undefined && p < t.minPSNR) reasons.push(`psnr<${t.minPSNR}`);
  if (t?.minSSIM !== undefined && s < t.minSSIM) reasons.push(`ssim<${t.minSSIM}`);
  const maxTime = t?.maxMsPerMP?.[input.backend];
  if (maxTime !== undefined && perMP > maxTime) reasons.push(`ms/MP>${maxTime}`);
  return {
    id: input.id,
    backend: input.backend,
    psnr: p,
    ssim: s,
    msPerMP: perMP,
    ok: reasons.length === 0,
    reasons,
  };
}
