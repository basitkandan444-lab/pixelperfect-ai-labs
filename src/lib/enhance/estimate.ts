// Pure, dependency-free time-to-complete estimation for the browser-first
// enhancement engine.
//
// Users bounce when they don't know how long a local enhancement will take, so
// the UI shows a live countdown ("about 20s remaining") the moment they press
// Enhance. This module turns the *known* work — the model's tiled forward passes
// (neural) or the progressive canvas resample (classical) — into a realistic
// wall-clock estimate for the user's device.
//
// It is a pure function over plain numbers (no DOM, no canvas, no onnxruntime),
// so it is trivially unit-testable and identical on the main thread and in a
// worker. All figures are conservative device-tier throughput constants derived
// from real Real-ESRGAN general-x4v3 (SRVGGNetCompact) WebGPU browser timings.

import { pickTileSize, planTiles, clampOverlap, DEFAULT_OVERLAP } from "./tiling";
import { computeTarget, type Scale } from "./targets";

export type EstimateEngine = "classical" | "neural";
export type EstimateTier = "high" | "medium" | "low";

const MODEL_SCALE = 4;

export interface EstimateInput {
  /** Natural source width in pixels. */
  srcW: number;
  /** Natural source height in pixels. */
  srcH: number;
  scale: Scale;
  engine: EstimateEngine;
  /** Coarse device tier from capability detection (defaults to "medium"). */
  tier?: EstimateTier;
  /**
   * Whether the neural model + runtime are already warmed (session created).
   * When true, the one-time model/WASM download+init cost is excluded — it has
   * already been paid in the background after upload.
   */
  warm?: boolean;
}

// Neural throughput: INPUT megapixels the model can push through the GPU per
// second (the 4× output is produced by the same pass). Conservative so the
// countdown rarely underruns the real completion.
const NEURAL_INPUT_MP_PER_SEC: Record<EstimateTier, number> = {
  high: 2.6,
  medium: 1.3,
  low: 0.6,
};

// One-time cost to download the 2.4MB model + ~22MB onnxruntime WASM and create
// the WebGPU session (cold start only; skipped once warmed).
const NEURAL_COLD_START_MS: Record<EstimateTier, number> = {
  high: 3000,
  medium: 4500,
  low: 6500,
};

// Fixed per-tile scheduling/marshalling overhead (buffer upload, yield, blend).
const NEURAL_PER_TILE_MS = 45;

// Classical throughput: OUTPUT megapixels resampled + filtered per second.
const CLASSICAL_OUTPUT_MP_PER_SEC: Record<EstimateTier, number> = {
  high: 16,
  medium: 10,
  low: 5,
};

const CLASSICAL_BASE_MS = 350;
const NEURAL_BASE_MS = 600;

function tierOf(input: EstimateInput): EstimateTier {
  return input.tier ?? "medium";
}

/**
 * Estimate how long an enhancement will take on this device, in milliseconds.
 * Always returns at least 1000ms so the countdown is never instantaneous.
 */
export function estimateEnhanceMs(input: EstimateInput): number {
  const { srcW, srcH, scale, engine } = input;
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    return 1000;
  }
  const tier = tierOf(input);
  const target = computeTarget(srcW, srcH, scale);
  const outPixels = target.width * target.height;

  if (engine === "classical") {
    const ms = CLASSICAL_BASE_MS + (outPixels / 1e6 / CLASSICAL_OUTPUT_MP_PER_SEC[tier]) * 1000;
    return Math.max(1000, Math.round(ms));
  }

  // NEURAL: the model sees the input at full resolution, bounded by the output
  // pixel budget (input long edge capped at target/4) — mirrors neural.ts.
  const srcLong = Math.max(srcW, srcH);
  const outCapLong = Math.max(target.width, target.height);
  const inCapLong = Math.max(1, Math.floor(outCapLong / MODEL_SCALE));
  const scaleDown = srcLong > inCapLong ? inCapLong / srcLong : 1;
  const inW = Math.max(1, Math.round(srcW * scaleDown));
  const inH = Math.max(1, Math.round(srcH * scaleDown));
  const inPixels = inW * inH;

  const tileSize = pickTileSize({ tier });
  const overlap = clampOverlap(DEFAULT_OVERLAP, tileSize);
  const tiles = planTiles(inW, inH, tileSize, overlap).length;

  let ms = NEURAL_BASE_MS;
  ms += (inPixels / 1e6 / NEURAL_INPUT_MP_PER_SEC[tier]) * 1000;
  ms += tiles * NEURAL_PER_TILE_MS;
  // Final high-quality resample from the 4× model output up to the 4K/8K target.
  ms += (outPixels / 1e6 / CLASSICAL_OUTPUT_MP_PER_SEC[tier]) * 1000;
  if (!input.warm) ms += NEURAL_COLD_START_MS[tier];

  return Math.max(1000, Math.round(ms));
}

/**
 * Human-friendly ETA label from a millisecond estimate, e.g. "about 20s",
 * "about 1m 05s". Rounds seconds up so the promise is never optimistic.
 */
export function formatEta(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec < 60) return `about ${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `about ${min}m ${sec.toString().padStart(2, "0")}s`;
}

/** Countdown label for the remaining milliseconds during processing. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Almost done…";
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec < 60) return `${totalSec}s remaining`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, "0")}s remaining`;
}
