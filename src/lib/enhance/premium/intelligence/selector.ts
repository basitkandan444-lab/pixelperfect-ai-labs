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
  deblock: 0.08,
  bilateral: 0.18,
  whiteBalance: 0.05,
  clahe: 0.2,
  microContrast: 0.22,
  sCurve: 0.05,
  vibrance: 0.07,
  faceRestore: 0.15,
};

function chooseBackend(env: SelectorEnv, profile: ImageProfile): PremiumBackend {
  const tight = (env.memoryGB ?? 8) <= 4 && profile.megapixels >= 12;
  const preferred = tight ? "wasm" : (env.backends[0] ?? "js");
  return env.backends.includes(preferred) ? preferred : (env.backends[0] ?? "js");
}

/** Build the plan. Purely a function of inputs. */
export function selectPlan(profile: ImageProfile, env: SelectorEnv): PremiumPlan {
  const stages: Capability[] = [];
  const params: PremiumPlanParams = {};
  const reasons: string[] = [];

  // 1. IMAX-Grade Deblocking (Aggressive)
  // We force deblock on for all images to ensure maximum smoothness on artifacts.
  stages.push("deblock");
  params.deblock = { strength: Math.max(1.5, 0.6 + profile.jpegBlockiness * 2.5) };
  reasons.push(`deblock: iMaxBlockSmooth=${profile.jpegBlockiness.toFixed(2)}`);

  // 2. IMAX-Grade Denoising (High Precision)
  // Always active for IMAX depth.
  stages.push("bilateral");
  const sigmaRange = Math.min(80, 20 + profile.noiseSigma * 4.0 + profile.jpegBlockiness * 40);
  params.bilateral = { radius: 4, sigmaSpatial: 2.5, sigmaRange };
  reasons.push(`bilateral: precisionDenoise=${profile.noiseSigma.toFixed(1)}`);

  // 3. Color Depth Recovery
  stages.push("whiteBalance");
  const wbStrength = Math.min(1.5, 0.8 + profile.colorCastLab / 10);
  params.whiteBalance = { strength: wbStrength };
  reasons.push(`whiteBalance: colorPrecision=${profile.colorCastLab.toFixed(1)}`);

  // 4. IMAX Dynamic Range (Aggressive CLAHE)
  stages.push("clahe");
  const clip = profile.lowlightRatio >= 0.2 ? 4.5 : 3.8;
  const blend = Math.min(0.95, 0.65 + profile.lowlightRatio * 1.5);
  params.clahe = { tiles: 16, clip, blend };
  reasons.push(`clahe: iMaxDynamicRange=${profile.lowlightRatio.toFixed(2)}`);

  // 5. Texture Injection (Micro-Contrast)
  // Heavy bump to ensure IMAX-grade detail is visible.
  const mcAmount = Math.min(1.2, 0.75 + profile.edgeDensity * 2.0);
  stages.push("microContrast");
  params.microContrast = { amount: mcAmount, radius: 3 };
  reasons.push(`microContrast: textureInjection=${profile.edgeDensity.toFixed(2)}`);

  // 6. IMAX Color Vibrance (Gamut Expansion)
  const vibAmount = Math.min(0.85, 0.35 + (0.3 - profile.chromaMean) * 1.8);
  stages.push("vibrance");
  params.vibrance = { amount: vibAmount };
  reasons.push(`vibrance: gamutExpansion=${profile.chromaMean.toFixed(2)}`);

  // 7. Cinematic Tone Mapping (S-Curve)
  // Stronger S-curve for that IMAX contrast.
  const scStrength = 0.35 + Math.min(0.25, profile.lowlightRatio * 0.5);
  stages.push("sCurve");
  params.sCurve = { strength: scStrength };
  reasons.push(`sCurve: cinematicToneMapping`);

  const backend = chooseBackend(env, profile);
  const tight = (env.memoryGB ?? 8) <= 4 && profile.megapixels >= 12;

  // 8. Hollywood Face Restoration
  const modelIds: string[] = [];
  if ((profile.faces ?? 0) >= 1 && env.allowModelDownload && !tight) {
    stages.push("faceRestore");
    params.faceRestore = { modelId: "gfpgan-v14-fp16" };
    modelIds.push("gfpgan-v14-fp16");
    reasons.push(`faceRestore: iMaxFaceClarity=${profile.faces}`);
  }

  const weights: Partial<Record<Capability, number>> = {};
  const total = stages.reduce((s, c) => s + DEFAULT_WEIGHTS[c], 0) || 1;
  for (const c of stages) weights[c] = DEFAULT_WEIGHTS[c] / total;

  return { stages, params, backend, modelIds, weights, reasons };
}
