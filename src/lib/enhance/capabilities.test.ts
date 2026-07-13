import { describe, it, expect } from "vitest";

import { detectCapabilities, type DetectionGlobals } from "./capabilities";

// A high-end desktop: WebGPU + OffscreenCanvas + Worker + lots of cores/memory.
function highEnd(): DetectionGlobals {
  const canvas = { getContext: (id: string) => (id === "webgl2" ? {} : null) };
  return {
    navigator: { gpu: {}, hardwareConcurrency: 16, deviceMemory: 16 },
    OffscreenCanvas: function OffscreenCanvas() {
      return canvas;
    } as unknown as DetectionGlobals["OffscreenCanvas"],
    Worker: function Worker() {} as unknown as DetectionGlobals["Worker"],
    createImageBitmap: (() => {}) as unknown as DetectionGlobals["createImageBitmap"],
  };
}

describe("detectCapabilities", () => {
  it("selects the worker path with GPU acceleration on a high-end device", () => {
    const caps = detectCapabilities(highEnd());
    expect(caps.supported).toBe(true);
    expect(caps.path).toBe("worker");
    expect(caps.accel).toBe("gpu");
    expect(caps.accelLabel).toBe("GPU acceleration");
    expect(caps.tier).toBe("high");
    expect(caps.webgpu).toBe(true);
  });

  it("falls back to the main-thread path without OffscreenCanvas", () => {
    const g: DetectionGlobals = {
      navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
      Worker: function Worker() {} as unknown as DetectionGlobals["Worker"],
      document: { createElement: () => ({ getContext: () => null }) },
    };
    const caps = detectCapabilities(g);
    expect(caps.path).toBe("main");
    expect(caps.supported).toBe(true);
    expect(caps.accel).toBe("cpu");
    expect(caps.accelLabel).toBe("CPU acceleration");
  });

  it("reports unsupported when there is no rasteriser at all", () => {
    const caps = detectCapabilities({ navigator: {} });
    expect(caps.supported).toBe(false);
  });

  it("classifies a low-end device as the low tier", () => {
    const g: DetectionGlobals = {
      navigator: { hardwareConcurrency: 2, deviceMemory: 2 },
      document: { createElement: () => ({ getContext: () => null }) },
    };
    const caps = detectCapabilities(g);
    expect(caps.tier).toBe("low");
  });

  it("defaults cores to a sane value when unavailable", () => {
    const caps = detectCapabilities({
      navigator: {},
      document: { createElement: () => ({ getContext: () => null }) },
    });
    expect(caps.cores).toBeGreaterThanOrEqual(1);
    expect(caps.memoryGB).toBeNull();
  });
});
