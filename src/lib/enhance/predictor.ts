// Self-calibrating, on-device time-prediction engine for the browser-first
// enhancement pipeline.
//
// The base physics model lives in `estimate.ts` (pure device-tier throughput
// math). This module wraps it with two extra layers that make the ETA feel like
// a premium desktop app rather than a spinner:
//
//   1. RICHER SIGNALS — it folds in every measurable factor available before a
//      run (megapixels, file bytes, format, tile count, warm state, device tier)
//      to produce a single predicted duration + a confidence score.
//
//   2. PER-DEVICE CALIBRATION — after every completed enhancement it compares
//      the predicted time with the ACTUAL time and updates a small, per-engine
//      correction factor persisted in localStorage. Estimates therefore get more
//      accurate the more the user runs enhancements on THAT specific device.
//
// Everything is deterministic, dependency-free and SSR-safe: no DOM, no canvas,
// no network. The only side effect is reading/writing a tiny JSON blob in
// localStorage, and every access is guarded + injectable for tests.

import { estimateEnhanceMs, type EstimateEngine, type EstimateTier } from "./estimate";
import { computeTarget, type Scale } from "./targets";
import { pickTileSize, planTiles, clampOverlap, DEFAULT_OVERLAP } from "./tiling";

const MODEL_SCALE = 4;

/** Minimal structural view of Web Storage so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CALIBRATION_KEY = "pp-pred-calibration-v1";

// One correction factor per engine (device characteristics differ wildly
// between the classical canvas path and the neural WebGPU path).
interface EngineCalibration {
  /** Multiplicative correction: actual ≈ base * factor. Starts at 1. */
  factor: number;
  /** Number of completed samples folded into `factor`. */
  samples: number;
  /** EMA of the absolute relative error |actual-predicted|/actual (0..1). */
  relError: number;
}

export type CalibrationStore = Partial<Record<EstimateEngine, EngineCalibration>>;

function freshCalibration(): EngineCalibration {
  return { factor: 1, samples: 0, relError: 0.25 };
}

// How quickly the correction factor tracks new evidence. A gentle EMA keeps a
// single fluky run (a background tab, a thermal throttle) from wrecking the
// estimate while still converging within a handful of runs.
const FACTOR_ALPHA = 0.35;
const ERROR_ALPHA = 0.4;
// Clamp the correction so a pathological outlier can never invert the model.
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 3;

export interface PredictionSignals {
  srcW: number;
  srcH: number;
  scale: Scale;
  engine: EstimateEngine;
  tier: EstimateTier;
  /** Neural model + runtime already warmed (session created). */
  warm: boolean;
  /** Encoded file size in bytes, when known (drives the decode-cost term). */
  fileBytes?: number;
  /** MIME type / format label, when known (informational + decode weighting). */
  format?: string;
}

export interface Prediction {
  /** Calibrated wall-clock estimate in milliseconds. */
  estimateMs: number;
  /** Raw physics estimate before per-device calibration. */
  baseMs: number;
  /** 0..1 confidence the estimate is close to reality. */
  confidence: number;
  /** Source megapixels. */
  megapixels: number;
  /** Output megapixels at the chosen quality. */
  outputMegapixels: number;
  /** Neural tiles that will actually be processed (0 for the classical path). */
  tiles: number;
}

/** Read the persisted calibration store, tolerating any corruption. */
export function loadCalibration(storage?: StorageLike | null): CalibrationStore {
  const s = storage ?? getDefaultStorage();
  if (!s) return {};
  try {
    const raw = s.getItem(CALIBRATION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CalibrationStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCalibration(store: CalibrationStore, storage?: StorageLike | null): void {
  const s = storage ?? getDefaultStorage();
  if (!s) return;
  try {
    s.setItem(CALIBRATION_KEY, JSON.stringify(store));
  } catch {
    // Storage full / disabled — calibration is best-effort, never fatal.
  }
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Count the neural tiles that will actually be processed for these signals. */
export function countTiles(signals: PredictionSignals): number {
  const { srcW, srcH, scale, engine, tier } = signals;
  if (engine !== "neural") return 0;
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) return 0;
  const target = computeTarget(srcW, srcH, scale);
  const outCapLong = Math.max(target.width, target.height);
  const inCapLong = Math.max(1, Math.floor(outCapLong / MODEL_SCALE));
  const srcLong = Math.max(srcW, srcH);
  const scaleDown = srcLong > inCapLong ? inCapLong / srcLong : 1;
  const inW = Math.max(1, Math.round(srcW * scaleDown));
  const inH = Math.max(1, Math.round(srcH * scaleDown));
  const tileSize = pickTileSize({ tier });
  const overlap = clampOverlap(DEFAULT_OVERLAP, tileSize);
  return planTiles(inW, inH, tileSize, overlap).length;
}

// A small additive decode term for heavy, densely-compressed files. Large JPEGs
// spend real time being decoded before any enhancement runs; this keeps the ETA
// honest without meaningfully changing light images.
function decodeOverheadMs(signals: PredictionSignals): number {
  const bytes = signals.fileBytes;
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return 0;
  const mb = bytes / (1024 * 1024);
  // ~40ms per MB of encoded data, capped so a 15MB upload adds < 0.6s.
  return Math.min(600, Math.round(mb * 40));
}

/**
 * Produce a calibrated prediction from all available pre-run signals. Pure given
 * a calibration store; pass `storage` in tests, omit it in the browser.
 */
export function predict(signals: PredictionSignals, storage?: StorageLike | null): Prediction {
  const { srcW, srcH, scale, engine, tier, warm } = signals;
  const validDims = Number.isFinite(srcW) && Number.isFinite(srcH) && srcW > 0 && srcH > 0;

  const baseMs =
    estimateEnhanceMs({ srcW, srcH, scale, engine, tier, warm }) + decodeOverheadMs(signals);

  const store = loadCalibration(storage);
  const calib = store[engine] ?? freshCalibration();

  const estimateMs = Math.max(1000, Math.round(baseMs * calib.factor));
  const megapixels = validDims ? (srcW * srcH) / 1e6 : 0;
  const outputMegapixels = validDims
    ? (() => {
        const t = computeTarget(srcW, srcH, scale);
        return (t.width * t.height) / 1e6;
      })()
    : 0;

  return {
    estimateMs,
    baseMs: Math.round(baseMs),
    confidence: confidenceFrom(calib),
    megapixels,
    outputMegapixels,
    tiles: countTiles(signals),
  };
}

// Confidence blends how much we've learned (sample count) with how accurate the
// recent predictions actually were (relError EMA). A brand-new device starts at
// a believable ~78% and climbs toward ~99% as it proves itself.
function confidenceFrom(calib: EngineCalibration): number {
  const learning = calib.samples / (calib.samples + 4); // 0 → ~1
  const accuracy = 1 - Math.min(0.5, calib.relError); // 0.5 → 1
  const prior = 0.72;
  const confidence = prior + (0.99 - prior) * (0.4 * learning + 0.6 * (accuracy - 0.5) * 2);
  return Math.max(0.6, Math.min(0.99, confidence));
}

/** Confidence as a whole-number percentage, e.g. 97. */
export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

export interface OutcomeInput {
  engine: EstimateEngine;
  /** The raw physics base used for the prediction (Prediction.baseMs). */
  baseMs: number;
  /** The wall-clock time the enhancement actually took. */
  actualMs: number;
}

/**
 * Fold a completed run into the per-device calibration and persist it. Returns
 * the updated store so callers/tests can assert without re-reading storage.
 */
export function recordOutcome(
  outcome: OutcomeInput,
  storage?: StorageLike | null,
): CalibrationStore {
  const { engine, baseMs, actualMs } = outcome;
  if (!Number.isFinite(baseMs) || !Number.isFinite(actualMs) || baseMs <= 0 || actualMs <= 0) {
    return loadCalibration(storage);
  }
  const store = loadCalibration(storage);
  const prev = store[engine] ?? freshCalibration();

  // Observed correction: how far the raw base was from reality this run.
  const observedFactor = clamp(actualMs / baseMs, MIN_FACTOR, MAX_FACTOR);
  const factor =
    prev.samples === 0
      ? observedFactor
      : clamp(prev.factor * (1 - FACTOR_ALPHA) + observedFactor * FACTOR_ALPHA, MIN_FACTOR, MAX_FACTOR);

  // Relative error of the CALIBRATED prediction we would have shown (prev.factor
  // applied to this run's base) versus the actual — this is what confidence uses.
  const predictedMs = baseMs * prev.factor;
  const relError = Math.abs(actualMs - predictedMs) / actualMs;
  const smoothedError =
    prev.samples === 0 ? relError : prev.relError * (1 - ERROR_ALPHA) + relError * ERROR_ALPHA;

  store[engine] = {
    factor,
    samples: prev.samples + 1,
    relError: Math.max(0, Math.min(1, smoothedError)),
  };
  saveCalibration(store, storage);
  return store;
}

/**
 * Adjust the ETA mid-run so it never expires early. Once real progress is
 * available we extrapolate the true total from elapsed/progress and blend it
 * with the original estimate, then return the remaining milliseconds — floored
 * so the countdown always shows a little time left until progress is complete.
 */
export function adjustRemainingMs(params: {
  estimateMs: number;
  elapsedMs: number;
  /** Pipeline progress in 0..1. */
  progress: number;
}): number {
  const { estimateMs, elapsedMs, progress } = params;
  const p = Math.max(0, Math.min(1, progress));

  // Below this we don't trust the extrapolation yet (startup jitter), so we lean
  // on the static estimate.
  const naiveRemaining = Math.max(0, estimateMs - elapsedMs);

  let remaining: number;
  if (p < 0.08) {
    remaining = naiveRemaining;
  } else {
    const projectedTotal = elapsedMs / p;
    // Blend projection with the original estimate, weighting the projection more
    // as we get closer to done (it becomes ground truth near the end).
    const blendedTotal = projectedTotal * (0.4 + 0.6 * p) + estimateMs * (0.6 - 0.6 * p);
    remaining = Math.max(0, blendedTotal - elapsedMs);
  }

  // Never let the clock hit zero while there's real work left: hold a minimum
  // that shrinks as we approach completion so the promise is kept, not broken.
  if (p < 0.995) {
    const floor = Math.max(300, Math.round((1 - p) * 1500));
    remaining = Math.max(remaining, floor);
  }
  return Math.round(remaining);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type ProcessingStage =
  | "preparing"
  | "analysis"
  | "enhancement"
  | "blending"
  | "finalizing";

export interface StageInfo {
  id: ProcessingStage;
  label: string;
}

export const PROCESSING_STAGES: readonly StageInfo[] = [
  { id: "preparing", label: "Preparing" },
  { id: "analysis", label: "AI Analysis" },
  { id: "enhancement", label: "Neural Enhancement" },
  { id: "blending", label: "Blending" },
  { id: "finalizing", label: "Finalizing" },
];

/** Map raw pipeline progress (0..1) to the current premium processing stage. */
export function stageForProgress(progress: number): ProcessingStage {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.1) return "preparing";
  if (p < 0.2) return "analysis";
  if (p < 0.78) return "enhancement";
  if (p < 0.92) return "blending";
  return "finalizing";
}

/** Index of the given stage within PROCESSING_STAGES (for step UIs). */
export function stageIndex(stage: ProcessingStage): number {
  return PROCESSING_STAGES.findIndex((s) => s.id === stage);
}
