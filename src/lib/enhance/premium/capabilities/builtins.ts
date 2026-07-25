// Built-in capability descriptors — the eight stages the premium engine ships
// today, expressed as CapabilityDescriptors so they participate uniformly in
// compat gating, budgeting, benchmarking, and dev telemetry.
//
// Behavior is unchanged: the selector still computes parameters. This module
// only records metadata about each stage.

import { registerCapability } from "./registry";
import type { CapabilityDescriptor } from "./types";

const BUILTINS: CapabilityDescriptor[] = [
  {
    id: "deblock", version: "1.0.0", label: "JPEG deblock",
    requires: ["canvas2d"], weight: 0.06,
    budget: { memMBPerMP: 4, timeMsPerMP: 8 },
    bench: { minPSNR: 28, minSSIM: 0.90 },
  },
  {
    id: "bilateral", version: "1.0.0", label: "Edge-preserving denoise",
    requires: ["canvas2d"], weight: 0.20,
    budget: { memMBPerMP: 6, timeMsPerMP: 24 },
    bench: { minPSNR: 30, minSSIM: 0.92 },
  },
  {
    id: "whiteBalance", version: "1.0.0", label: "Gray-world white balance",
    requires: ["canvas2d"], weight: 0.05,
    budget: { memMBPerMP: 2, timeMsPerMP: 3 },
  },
  {
    id: "clahe", version: "1.0.0", label: "CLAHE local contrast",
    requires: ["canvas2d"], weight: 0.22,
    budget: { memMBPerMP: 8, timeMsPerMP: 18 },
    bench: { minPSNR: 26, minSSIM: 0.88 },
  },
  {
    id: "microContrast", version: "1.0.0", label: "Gated micro-contrast",
    requires: ["canvas2d"], weight: 0.18,
    budget: { memMBPerMP: 6, timeMsPerMP: 12 },
    bench: { minSSIM: 0.90 },
  },
  {
    id: "sCurve", version: "1.0.0", label: "Tonal S-curve",
    requires: ["canvas2d"], weight: 0.03,
    budget: { memMBPerMP: 2, timeMsPerMP: 2 },
  },
  {
    id: "vibrance", version: "1.0.0", label: "Perceptual vibrance",
    requires: ["canvas2d"], weight: 0.06,
    budget: { memMBPerMP: 2, timeMsPerMP: 3 },
  },
  {
    id: "faceRestore", version: "0.1.0", label: "Face restoration (gated)",
    requires: ["canvas2d", "wasm"], weight: 0.20,
    budget: { memMBPerMP: 40, timeMsPerMP: 300 },
    requiresModelDownload: true,
  },
];

let registered = false;
export function registerBuiltins(): void {
  if (registered) return;
  for (const d of BUILTINS) registerCapability(d);
  registered = true;
}

// Auto-register on import so consumers don't have to remember.
registerBuiltins();
