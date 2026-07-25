// Types shared by the premium intelligence layer.
//
// Everything here is pure data — no runtime, no DOM, no side effects — so it's
// safe to import from any module (SSR, worker, tests).

/** One optional stage the premium pipeline can run. */
export type Capability =
  | "deblock"
  | "bilateral"
  | "whiteBalance"
  | "clahe"
  | "microContrast"
  | "sCurve"
  | "vibrance"
  | "faceRestore";

/** Compact fingerprint of a decoded RGBA buffer, computed on a downsample. */
export interface ImageProfile {
  width: number;
  height: number;
  megapixels: number;
  /** 0..1, higher = more JPEG-8×8 blockiness detected. */
  jpegBlockiness: number;
  /** Estimated noise stddev in 0..255 space. */
  noiseSigma: number;
  /** Fraction of pixels with luma < 0.2 in linear-light. */
  lowlightRatio: number;
  /** ΔE-ish magnitude of channel-mean drift from neutral in Lab-approx. */
  colorCastLab: number;
  /** Mean chroma (0..1). Low = flat/muted colors. */
  chromaMean: number;
  /** Fraction of pixels contributing to a strong gradient. */
  edgeDensity: number;
  /** Fraction of pixels with any channel at 0 or 255. */
  gamutClipPct: number;
  /** Number of face regions if a detector was available; else undefined. */
  faces?: number;
}

/** Per-stage tuned parameters. Only stages listed in `stages` run. */
export interface PremiumPlanParams {
  bilateral?: { radius: number; sigmaSpatial: number; sigmaRange: number };
  clahe?: { tiles: number; clip: number; blend: number };
  whiteBalance?: { strength: number };
  vibrance?: { amount: number };
  microContrast?: { amount: number; radius: number };
  sCurve?: { strength: number };
  deblock?: { strength: number };
  faceRestore?: { modelId: string };
}

export type PremiumBackend = "webgpu" | "wasm" | "js";

export interface PremiumPlan {
  stages: Capability[];
  params: PremiumPlanParams;
  backend: PremiumBackend;
  /** Model ids the plan intends to load (may be empty). */
  modelIds: string[];
  /** Sum of per-stage progress weights, for the scheduler. */
  weights: Partial<Record<Capability, number>>;
  /** Human-readable rationale for observability / debugging. */
  reasons: string[];
}

/** Environment hints used by the selector alongside the profile. */
export interface SelectorEnv {
  /** Device RAM in GB, if known. */
  memoryGB?: number;
  /** Detected backend availability, in preference order. */
  backends: PremiumBackend[];
  /** Whether the caller has opted-in to downloading extra models. */
  allowModelDownload?: boolean;
}
