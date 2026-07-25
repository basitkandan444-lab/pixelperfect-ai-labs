// Per-capability, per-backend benchmark thresholds. Editable JSON-like table;
// pure data, no runtime cost.

import type { PremiumBackend } from "../../intelligence/plan";

export interface BenchThreshold {
  minPSNR?: number;
  minSSIM?: number;
  maxMsPerMP?: Partial<Record<PremiumBackend, number>>;
}

export const BENCH_THRESHOLDS: Readonly<Record<string, BenchThreshold>> = Object.freeze({
  deblock: { minPSNR: 28, minSSIM: 0.90, maxMsPerMP: { js: 20, wasm: 12, webgpu: 6 } },
  bilateral: { minPSNR: 30, minSSIM: 0.92, maxMsPerMP: { js: 50, wasm: 28, webgpu: 10 } },
  clahe: { minPSNR: 26, minSSIM: 0.88, maxMsPerMP: { js: 40, wasm: 20, webgpu: 8 } },
  microContrast: { minSSIM: 0.90, maxMsPerMP: { js: 30, wasm: 16, webgpu: 6 } },
  whiteBalance: { maxMsPerMP: { js: 8, wasm: 5, webgpu: 2 } },
  vibrance: { maxMsPerMP: { js: 8, wasm: 5, webgpu: 2 } },
  sCurve: { maxMsPerMP: { js: 6, wasm: 3, webgpu: 1 } },
  faceRestore: { minSSIM: 0.85, maxMsPerMP: { wasm: 800, webgpu: 200 } },
});
