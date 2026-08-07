// Progress-weighted, cancellable stage runner.
//
// Given a PremiumPlan and a map of stage runners, invokes each stage in order,
// forwarding a weighted progress value in [0..1] and honoring an AbortSignal.
// Each stage runner receives the current RGBA buffer and returns a new one.

import type { Capability, PremiumPlan } from "../intelligence/plan";

export interface StageContext {
  width: number;
  height: number;
  plan: PremiumPlan;
  signal?: AbortSignal;
  onStageProgress?: (fraction: number, message: string) => void;
}

export type StageRunner = (
  buf: Uint8ClampedArray,
  ctx: StageContext,
) => Promise<Uint8ClampedArray> | Uint8ClampedArray;

export type StageMap = Partial<Record<Capability, StageRunner>>;

function abortError() {
  return new DOMException("Enhancement cancelled.", "AbortError");
}

const STAGE_LABEL: Record<Capability, string> = {
  deblock: "Reducing JPEG artifacts…",
  bilateral: "Denoising (edge-preserving)…",
  whiteBalance: "Correcting color balance…",
  clahe: "Recovering local contrast…",
  microContrast: "Sharpening details…",
  sCurve: "Adjusting tone curve…",
  vibrance: "Enhancing color…",
  faceRestore: "Restoring faces…",
};

export async function runPlan(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  plan: PremiumPlan,
  stages: StageMap,
  opts: { signal?: AbortSignal; onProgress?: (v: number, m: string) => void } = {},
): Promise<Uint8ClampedArray> {
  let cursor = 0;
  let current = buf;
  for (const stage of plan.stages) {
    if (opts.signal?.aborted) throw abortError();
    const runner = stages[stage];
    const weight = plan.weights[stage] ?? 0;
    if (!runner) {
      cursor += weight;
      continue;
    }
    opts.onProgress?.(cursor, STAGE_LABEL[stage]);
    const started = cursor;
    const next = await runner(current, {
      width,
      height,
      plan,
      signal: opts.signal,
      onStageProgress: (frac, message) => {
        opts.onProgress?.(started + weight * Math.max(0, Math.min(1, frac)), message);
      },
    });
    current = next;
    cursor += weight;
    // Yield to the event loop between stages so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }
  opts.onProgress?.(1, "Premium finish complete.");
  return current;
}
