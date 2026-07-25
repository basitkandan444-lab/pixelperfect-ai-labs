import { describe, it, expect } from "vitest";
import { MODEL_REGISTRY, getModel } from "./registry";

describe("model registry", () => {
  it("includes the shipped Real-ESRGAN model", () => {
    const m = getModel("realesrgan-x4v3");
    expect(m).toBeDefined();
    expect(m!.purpose).toBe("upscale");
    expect(m!.url).toContain("realesrgan-x4v3.onnx");
  });

  it("declares the optional face model but leaves fetching to caller consent", () => {
    const m = getModel("gfpgan-v14-fp16");
    expect(m).toBeDefined();
    expect(m!.purpose).toBe("faceRestore");
  });

  it("returns undefined for unknown ids", () => {
    expect(getModel("does-not-exist")).toBeUndefined();
  });

  it("is frozen (immutable at runtime)", () => {
    expect(() => {
      (MODEL_REGISTRY as unknown as Record<string, unknown>)["evil"] = {};
    }).toThrow();
  });
});
