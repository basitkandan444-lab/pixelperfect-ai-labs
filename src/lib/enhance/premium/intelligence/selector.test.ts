import { describe, it, expect } from "vitest";
import type { ImageProfile, SelectorEnv } from "./plan";
import { selectPlan } from "./selector";

const baseProfile: ImageProfile = {
  width: 2000,
  height: 1500,
  megapixels: 3,
  jpegBlockiness: 0,
  noiseSigma: 1,
  lowlightRatio: 0.02,
  colorCastLab: 0,
  chromaMean: 0.25,
  edgeDensity: 0.1,
  gamutClipPct: 0,
};

const env: SelectorEnv = { memoryGB: 8, backends: ["webgpu", "wasm", "js"] };

describe("selector", () => {
  it("skips deblock and bilateral on clean images", () => {
    const plan = selectPlan(baseProfile, env);
    expect(plan.stages).not.toContain("deblock");
    // Faint noise (sigma=1) below threshold
    expect(plan.stages).not.toContain("bilateral");
  });

  it("enables deblock + bilateral on JPEG-crushed images", () => {
    const plan = selectPlan({ ...baseProfile, jpegBlockiness: 0.5, noiseSigma: 8 }, env);
    expect(plan.stages).toContain("deblock");
    expect(plan.stages).toContain("bilateral");
    expect(plan.params.bilateral!.sigmaRange).toBeGreaterThan(20);
  });

  it("enables whiteBalance when color cast is present", () => {
    const plan = selectPlan({ ...baseProfile, colorCastLab: 12 }, env);
    expect(plan.stages).toContain("whiteBalance");
    expect(plan.params.whiteBalance!.strength).toBeGreaterThan(0.5);
  });

  it("disables microContrast on flat images", () => {
    const plan = selectPlan({ ...baseProfile, edgeDensity: 0.01 }, env);
    expect(plan.stages).not.toContain("microContrast");
  });

  it("enables vibrance on muted images", () => {
    const plan = selectPlan({ ...baseProfile, chromaMean: 0.05 }, env);
    expect(plan.stages).toContain("vibrance");
  });

  it("forces WASM backend on huge images with low RAM", () => {
    const plan = selectPlan(
      { ...baseProfile, width: 8000, height: 6000, megapixels: 48 },
      { memoryGB: 4, backends: ["webgpu", "wasm", "js"] },
    );
    expect(plan.backend).toBe("wasm");
  });

  it("queues face model only when allowed and faces detected", () => {
    const withFaces = { ...baseProfile, faces: 2 };
    const denied = selectPlan(withFaces, { ...env, allowModelDownload: false });
    const allowed = selectPlan(withFaces, { ...env, allowModelDownload: true });
    expect(denied.modelIds).toHaveLength(0);
    expect(denied.stages).not.toContain("faceRestore");
    expect(allowed.stages).toContain("faceRestore");
    expect(allowed.modelIds).toContain("gfpgan-v14-fp16");
  });

  it("stage weights are normalized to sum ~1", () => {
    const plan = selectPlan({ ...baseProfile, noiseSigma: 8, chromaMean: 0.05 }, env);
    const sum = Object.values(plan.weights).reduce((s, v) => s + (v ?? 0), 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("reasons are populated per selected stage", () => {
    const plan = selectPlan({ ...baseProfile, noiseSigma: 8 }, env);
    expect(plan.reasons.length).toBeGreaterThan(0);
  });
});
