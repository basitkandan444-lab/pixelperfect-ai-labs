// Capability descriptor contract — the Task 8 plug-and-play interface.
//
// Every current and future premium stage is described by one CapabilityDescriptor.
// The descriptor carries the metadata the production layers (compat gating,
// budgeting, benchmarking, verification, telemetry) need — WITHOUT owning the
// selection math today. The existing deterministic selector remains the source
// of truth for parameter tuning; the registry supplies the surrounding
// machinery so new capabilities can plug in without touching the selector.

import type { Capability, PremiumBackend } from "../intelligence/plan";

export type FeatureFlag =
  | "webgpu"
  | "wasm"
  | "wasm-simd"
  | "workers"
  | "offscreen-canvas"
  | "createImageBitmap"
  | "canvas2d";

export interface CapabilityBudget {
  /** Rough peak-memory hint in MB per megapixel of input. */
  memMBPerMP: number;
  /** Rough wall-time hint in ms per megapixel on the preferred backend. */
  timeMsPerMP: number;
}

export interface CapabilityBenchSpec {
  /** Minimum acceptable PSNR vs reference fixture. */
  minPSNR?: number;
  /** Minimum acceptable SSIM vs reference fixture. */
  minSSIM?: number;
  /** Maximum acceptable wall time per megapixel, per backend. */
  maxMsPerMP?: Partial<Record<PremiumBackend, number>>;
}

export interface CapabilityDescriptor {
  /** Stable id — matches the `Capability` union for built-ins, free-form for future. */
  id: Capability | string;
  /** Semantic version. Bump when behavior changes so caches/benches invalidate. */
  version: string;
  /** Human-readable label for dev telemetry. */
  label: string;
  /** Feature flags this capability requires to run. Missing → downgraded/skipped. */
  requires: FeatureFlag[];
  /** Progress weight used by the scheduler (0..1). */
  weight: number;
  /** Cost hints used by the advisor + selector. */
  budget: CapabilityBudget;
  /** Optional bench thresholds. */
  bench?: CapabilityBenchSpec;
  /** True if this capability may fetch a model at runtime (gated by consent). */
  requiresModelDownload?: boolean;
}
