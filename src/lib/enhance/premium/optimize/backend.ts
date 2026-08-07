// Backend feature detection for the premium pipeline.
//
// Deterministic, cached, and SSR-safe. Result is memoized for the tab lifetime
// because each detection call (especially WebGPU adapter probing) is not free.

import type { PremiumBackend } from "../intelligence/plan";

let cached: PremiumBackend[] | null = null;

/** Returns backends in preference order. Never throws; empty array is possible
 * only in the SSR path, where `js` is added as a safe fallback. */
export async function detectBackends(): Promise<PremiumBackend[]> {
  if (cached) return cached;
  if (typeof window === "undefined" || import.meta.env.SSR) {
    cached = ["js"];
    return cached;
  }
  const out: PremiumBackend[] = [];
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu) {
      const adapter = await gpu.requestAdapter();
      if (adapter) out.push("webgpu");
    }
  } catch {
    /* ignore */
  }
  // WASM SIMD detection: quick binary probe. WebAssembly is required either way.
  try {
    if (typeof WebAssembly !== "undefined") {
      // Minimal SIMD-probe module (v128.const). If the browser rejects, no SIMD.
      const simd = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ]);
      if (WebAssembly.validate(simd)) out.push("wasm");
    }
  } catch {
    /* ignore */
  }
  out.push("js");
  cached = out;
  return out;
}

/** Sync convenience for callers that already have the array. */
export function bestBackend(list: PremiumBackend[]): PremiumBackend {
  return list[0] ?? "js";
}

/** Test-only. */
export function __resetBackendCacheForTests() {
  cached = null;
}
