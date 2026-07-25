// Deterministic capability + parameter selector.
//
// Given an ImageProfile and an environment, produce a PremiumPlan naming which
// stages run, how strongly, on which backend, and with which models. Pure
// function — no side effects, trivial to unit-test.

import type {
  Capability,
  ImageProfile,
  PremiumBackend,
  PremiumPlan,
  PremiumPlanParams,
  SelectorEnv,
} from "./plan";

const DEFAULT_WEIGHTS: Record<Capability, number> = {
  deblock: 0.06,
  bilateral: 0.20,
  whiteBalance: 0.05,
  clahe: 0.22,
  microContrast: 0.18,
  sCurve: 0.03,
  vibrance: 0.06,
  faceRestore: 0.20,
};

function chooseBackend(env: SelectorEnv, profile: ImageProfile): PremiumBackend {
  const tight = (env.memoryGB ?? 8) <= 4 && profile.megapixels >= 12;
  const preferred = tight ? "wasm" : env.backends[0] ?? "js";
  return env.backends.includes(preferred) ? preferred : (env.backends[0] ?? "js");
}

/** Build the plan. Purely a function of inputs. */
export function selectPlan(profile: ImageProfile, env: SelectorEnv): PremiumPlan {
  const stages: Capability[] = [];
  const params: PremiumPlanParams = {};
  const reasons: string[] = [];

  // JPEG artefacts → deblock first, and bump denoise strength.
  if (profile.jpegBlockiness >= 0.35) {
    stages.push("deblock");
    params.deblock = { strength: Math.min(1, profile.jpegBlockiness * 1.4) };
    reasons.push(`deblock: jpegBlockiness=${profile.jpegBlockiness.toFixed(2)}`);
  }

  // Noise → bilateral, strength scaled to detected sigma.
  if (profile.noiseSigma >= 4 || profile.jpegBlockiness >= 0.25) {
    const sigmaRange = Math.min(48, 8 + profile.noiseSigma * 2.2 + profile.jpegBlockiness * 20);
    stages.push("bilateral");
    params.bilateral = { radius: 2, sigmaSpatial: 1.6, sigmaRange };
    reasons.push(`bilateral: noiseSigma=${profile.noiseSigma.toFixed(1)}`);
  }

  // Color cast → white balance.
  if (profile.colorCastLab >= 3) {
    const strength = Math.min(1, 0.35 + profile.colorCastLab / 30);
    stages.push("whiteBalance");
    params.whiteBalance = { strength };
    reasons.push(`whiteBalance: cast=${profile.colorCastLab.toFixed(1)}`);
  }

  // CLAHE unless the image is already high-contrast + bright.
  if (profile.lowlightRatio >= 0.05 || profile.edgeDensity < 0.20) {
    const clip = profile.lowlightRatio >= 0.30 ? 2.6 : 2.2;
    const blend = Math.min(0.7, 0.35 + profile.lowlightRatio * 0.9);
    stages.push("clahe");
    params.clahe = { tiles: 8, clip, blend };
    reasons.push(`clahe: lowlight=${profile.lowlightRatio.toFixed(2)}`);
  }

  // Micro-contrast — only on images with real detail; flat images would just
  // amplify residual noise.
  if (profile.edgeDensity >= 0.04) {
    const amount = Math.min(0.42, 0.20 + profile.edgeDensity * 0.9);
    stages.push("microContrast");
    params.microContrast = { amount, radius: 1 };
    reasons.push(`microContrast: edges=${profile.edgeDensity.toFixed(2)}`);
  }

  // Vibrance for muted colours, protecting skin (handled inside `vibrance()`).
  if (profile.chromaMean <= 0.18) {
    const amount = Math.min(0.24, 0.10 + (0.18 - profile.chromaMean) * 0.8);
    stages.push("vibrance");
    params.vibrance = { amount };
    reasons.push(`vibrance: chroma=${profile.chromaMean.toFixed(2)}`);
  }

  // Global S-curve when the image needs pop (low chroma OR shadow-heavy).
  if (profile.lowlightRatio >= 0.20 || profile.chromaMean <= 0.10) {
    const strength = 0.08 + Math.min(0.08, profile.lowlightRatio * 0.15);
    stages.push("sCurve");
    params.sCurve = { strength };
    reasons.push(`sCurve: lowlight/flat`);
  }

  const backend = chooseBackend(env, profile);
  const tight = (env.memoryGB ?? 8) <= 4 && profile.megapixels >= 12;

  const modelIds: string[] = [];
  if ((profile.faces ?? 0) >= 1 && env.allowModelDownload && !tight) {
    stages.push("faceRestore");
    params.faceRestore = { modelId: "gfpgan-v14-fp16" };
    modelIds.push("gfpgan-v14-fp16");
    reasons.push(`faceRestore: faces=${profile.faces}`);
  }

  const weights: Partial<Record<Capability, number>> = {};
  const total = stages.reduce((s, c) => s + DEFAULT_WEIGHTS[c], 0) || 1;
  for (const c of stages) weights[c] = DEFAULT_WEIGHTS[c] / total;

  return { stages, params, backend, modelIds, weights, reasons };
}
