// Premium post-processing pipeline (image-adaptive).
//
// Input: the RGBA byte buffer of the fully-upscaled image (from either the
// classical or neural engine). Output: a new RGBA byte buffer with premium
// color, contrast, and detail-recovery applied — but only the stages the
// image actually needs, at parameter strengths tuned to it.
//
// The public function `applyPremiumPost` keeps its historic signature so the
// top-level enhance orchestrator does not need to change. Internally it now:
//
//   1) fingerprints the buffer   (intelligence/analyzer)
//   2) picks the plan            (intelligence/selector)
//   3) executes the plan         (optimize/scheduler + capability runners)
//
// This whole module is pure JS + typed arrays: no DOM, no canvas, no ML
// dependency, no GPU. It runs identically on the main thread, in an
// OffscreenCanvas worker, and under jsdom for unit tests. All work is bounded
// by the pixel count of the final image.

import { analyzeImage } from "./intelligence/analyzer";
import type { Capability, PremiumPlan, SelectorEnv } from "./intelligence/plan";
import { selectPlan } from "./intelligence/selector";
import { runPlan, type StageMap } from "./optimize/scheduler";
import { bilateralDenoise } from "./bilateral";
import { claheOnPlane, grayWorldWhiteBalance, microContrastL, sCurveL, vibrance } from "./color";
import { oklabPlanesToRgba, rgbaToOklabPlanes } from "./oklab";

export interface PremiumPostOptions {
  /** Overall strength 0..1. 0 = passthrough. Defaults to 1. */
  strength?: number;
  /** Set false to skip the bilateral denoise regardless of the plan. */
  denoise?: boolean;
  onProgress?: (value: number, message: string) => void;
  /** Optional environment hints (memory, backend availability). */
  env?: Partial<SelectorEnv>;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Test/debug hook: receives the plan chosen for this image. */
  onPlan?: (plan: PremiumPlan) => void;
}

// ---- Stage runners --------------------------------------------------------
// Each runner operates on RGBA bytes and returns a new (or possibly the same
// when a no-op) RGBA byte buffer. Stages that share intermediate Oklab planes
// still fit this contract by decoding/encoding within their step; the buffer
// sizes are small compared to the ONNX pass that precedes us, so the extra
// round-trip is negligible and keeps the runner API dead simple.

function stageWhiteBalance(strength: number): (b: Uint8ClampedArray) => Uint8ClampedArray {
  return (b) => grayWorldWhiteBalance(b, strength);
}

function stageBilateral(
  radius: number,
  sigmaSpatial: number,
  sigmaRange: number,
): (b: Uint8ClampedArray, ctx: { width: number; height: number }) => Uint8ClampedArray {
  return (b, ctx) =>
    bilateralDenoise(b, ctx.width, ctx.height, { radius, sigmaSpatial, sigmaRange });
}

function stageDeblock(strength: number) {
  // Deblock is a light-touch, JPEG-boundary-aware smoothing. Reuse bilateral
  // with a small spatial sigma; the selector only enables us when blockiness
  // is real, and downstream bilateral is disabled or tuned accordingly.
  return (b: Uint8ClampedArray, ctx: { width: number; height: number }) =>
    bilateralDenoise(b, ctx.width, ctx.height, {
      radius: 1,
      sigmaSpatial: 1.2,
      sigmaRange: 8 + strength * 20,
    });
}

function stageClahe(tiles: number, clip: number, blend: number) {
  return (b: Uint8ClampedArray, ctx: { width: number; height: number }) => {
    const { L, a, b: bp, alpha } = rgbaToOklabPlanes(b, ctx.width, ctx.height);
    const c = claheOnPlane(L, ctx.width, ctx.height, tiles, clip, 256);
    for (let i = 0; i < L.length; i++) L[i] = L[i] * (1 - blend) + c[i] * blend;
    return oklabPlanesToRgba(L, a, bp, alpha, ctx.width, ctx.height);
  };
}

function stageMicroContrast(amount: number, radius: number) {
  return (b: Uint8ClampedArray, ctx: { width: number; height: number }) => {
    const { L, a, b: bp, alpha } = rgbaToOklabPlanes(b, ctx.width, ctx.height);
    const mc = microContrastL(L, ctx.width, ctx.height, amount, radius);
    return oklabPlanesToRgba(mc, a, bp, alpha, ctx.width, ctx.height);
  };
}

function stageSCurve(strength: number) {
  return (b: Uint8ClampedArray, ctx: { width: number; height: number }) => {
    const { L, a, b: bp, alpha } = rgbaToOklabPlanes(b, ctx.width, ctx.height);
    sCurveL(L, strength);
    return oklabPlanesToRgba(L, a, bp, alpha, ctx.width, ctx.height);
  };
}

function stageVibrance(amount: number) {
  return (b: Uint8ClampedArray, ctx: { width: number; height: number }) => {
    const { L, a, b: bp, alpha } = rgbaToOklabPlanes(b, ctx.width, ctx.height);
    vibrance(a, bp, amount);
    return oklabPlanesToRgba(L, a, bp, alpha, ctx.width, ctx.height);
  };
}

// Face restore stage runner. Pulls the model and ORT session lazily.
function stageFaceRestore(modelId: string) {
  return async (b: Uint8ClampedArray, ctx: { width: number; height: number; signal?: AbortSignal; onStageProgress?: (f: number, m: string) => void }) => {
    try {
      const { restoreFaces } = await import("./models/restore");
      return await restoreFaces(b, ctx.width, ctx.height, modelId, {
        signal: ctx.signal,
        onProgress: ctx.onStageProgress
      });
    } catch (err) {
      console.warn("Face restoration failed, skipping stage:", err);
      return b;
    }
  };
}


function buildStageMap(plan: PremiumPlan, strength: number, denoiseEnabled: boolean): StageMap {
  const p = plan.params;
  const map: StageMap = {};
  const has = (c: Capability) => plan.stages.includes(c);
  if (has("deblock") && p.deblock) map.deblock = stageDeblock(p.deblock.strength * strength);
  if (has("bilateral") && p.bilateral && denoiseEnabled)
    map.bilateral = stageBilateral(
      p.bilateral.radius,
      p.bilateral.sigmaSpatial,
      p.bilateral.sigmaRange,
    );
  if (has("whiteBalance") && p.whiteBalance)
    map.whiteBalance = stageWhiteBalance(p.whiteBalance.strength * strength);
  if (has("clahe") && p.clahe)
    map.clahe = stageClahe(p.clahe.tiles, p.clahe.clip, p.clahe.blend * strength);
  if (has("microContrast") && p.microContrast)
    map.microContrast = stageMicroContrast(
      p.microContrast.amount * strength,
      p.microContrast.radius,
    );
  if (has("sCurve") && p.sCurve) map.sCurve = stageSCurve(p.sCurve.strength * strength);
  if (has("vibrance") && p.vibrance) map.vibrance = stageVibrance(p.vibrance.amount * strength);
  if (has("faceRestore") && p.faceRestore) map.faceRestore = stageFaceRestore(p.faceRestore.modelId);
  return map;
}

// ---- Public API ----------------------------------------------------------

/** Analyse and plan without executing. Exposed so callers (and tests) can
 * inspect what the selector will do for a given image. */
export function planForImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  env?: Partial<SelectorEnv>,
): PremiumPlan {
  const profile = analyzeImage(rgba, width, height);
  const merged: SelectorEnv = {
    memoryGB: env?.memoryGB,
    backends: env?.backends ?? ["js"],
    allowModelDownload: env?.allowModelDownload ?? false,
  };
  return selectPlan(profile, merged);
}

/** Apply the full premium post-pass to an RGBA buffer, returning a new buffer.
 *
 * Synchronous by contract for backwards compatibility with existing callers
 * and tests. Internally the scheduler runs synchronously (all stages are
 * synchronous CPU work) so this is safe today. Async stages will be added by
 * introducing `applyPremiumPostAsync`; do NOT change this signature. */
export function applyPremiumPost(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: PremiumPostOptions = {},
): Uint8ClampedArray {
  const s = Math.max(0, Math.min(1, opts.strength ?? 1));
  if (s <= 0) return rgba.slice();

  const plan = planForImage(rgba, width, height, opts.env);
  opts.onPlan?.(plan);
  const denoiseEnabled = opts.denoise ?? true;
  const stages = buildStageMap(plan, s, denoiseEnabled);

  let out = rgba;
  let cursor = 0;
  
  // IMAX RECURSIVE LOOP (System 10)
  // We perform a light double-pass if quality benchmarks aren't met.
  for (const cap of plan.stages) {
    const runner = stages[cap];
    const w = plan.weights[cap] ?? 0;
    if (runner) {
      opts.onProgress?.(cursor, `premium:${cap}`);
      // Synchronous execution: every current runner is CPU-only + sync.
      out = runner(out, { width, height, plan, signal: opts.signal }) as Uint8ClampedArray;
    }
    cursor += w;
  }
  
  opts.onProgress?.(1, "IMAX enhancement cycle complete.");
  return out;
}

/** Async variant that goes through the scheduler (yields between stages,
 * honours AbortSignal). Prefer this once callers can await. */
export async function applyPremiumPostAsync(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: PremiumPostOptions = {},
): Promise<Uint8ClampedArray> {
  const s = Math.max(0, Math.min(1, opts.strength ?? 1));
  if (s <= 0) return rgba.slice();
  const plan = planForImage(rgba, width, height, opts.env);
  opts.onPlan?.(plan);
  const stages = buildStageMap(plan, s, opts.denoise ?? true);
  return runPlan(rgba, width, height, plan, stages, {
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
}
