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
  if (profile.jpegBlockiness >= 0.15) {
    stages.push("deblock");
    params.deblock = { strength: Math.min(1.2, 0.4 + profile.jpegBlockiness * 1.8) };
    reasons.push(`deblock: iMaxBlockDetect=${profile.jpegBlockiness.toFixed(2)}`);
  }

  // 2. IMAX-Grade Denoising (High Precision)
  if (profile.noiseSigma >= 2 || profile.jpegBlockiness >= 0.1) {
    const sigmaRange = Math.min(64, 12 + profile.noiseSigma * 2.8 + profile.jpegBlockiness * 25);
    stages.push("bilateral");
    params.bilateral = { radius: 3, sigmaSpatial: 2.0, sigmaRange };
    reasons.push(`bilateral: precisionDenoise=${profile.noiseSigma.toFixed(1)}`);
  }

  // 3. Color Depth Recovery
  if (profile.colorCastLab >= 1.5) {
    const strength = Math.min(1.2, 0.45 + profile.colorCastLab / 20);
    stages.push("whiteBalance");
    params.whiteBalance = { strength };
    reasons.push(`whiteBalance: colorPrecision=${profile.colorCastLab.toFixed(1)}`);
  }

  // 4. IMAX Dynamic Range (Aggressive CLAHE)
  stages.push("clahe");
  const clip = profile.lowlightRatio >= 0.2 ? 3.2 : 2.8;
  const blend = Math.min(0.85, 0.45 + profile.lowlightRatio * 1.2);
  params.clahe = { tiles: 12, clip, blend };
  reasons.push(`clahe: iMaxDynamicRange=${profile.lowlightRatio.toFixed(2)}`);

  // 5. Texture Injection (Micro-Contrast)
  const mcAmount = Math.min(0.65, 0.35 + profile.edgeDensity * 1.2);
  stages.push("microContrast");
  params.microContrast = { amount: mcAmount, radius: 2 };
  reasons.push(`microContrast: textureInjection=${profile.edgeDensity.toFixed(2)}`);

  // 6. IMAX Color Vibrance (Gamut Expansion)
  const vibAmount = Math.min(0.45, 0.18 + (0.25 - profile.chromaMean) * 1.2);
  stages.push("vibrance");
  params.vibrance = { amount: vibAmount };
  reasons.push(`vibrance: gamutExpansion=${profile.chromaMean.toFixed(2)}`);

  // 7. Cinematic Tone Mapping (S-Curve)
  const scStrength = 0.15 + Math.min(0.12, profile.lowlightRatio * 0.25);
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
