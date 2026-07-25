// Browser compatibility matrix. SSR-safe, cached per session.

import type { FeatureFlag } from "../../capabilities/types";

let cached: Set<FeatureFlag> | null = null;

function isSSR(): boolean {
  return typeof window === "undefined" || (import.meta.env?.SSR ?? false);
}

export async function detectFeatures(): Promise<Set<FeatureFlag>> {
  if (cached) return cached;
  const s = new Set<FeatureFlag>();
  if (isSSR()) { cached = s; return s; }

  if (typeof document !== "undefined") {
    try {
      const c = document.createElement("canvas");
      if (c.getContext("2d")) s.add("canvas2d");
    } catch { /* ignore */ }
  }
  if (typeof Worker !== "undefined") s.add("workers");
  if (typeof OffscreenCanvas !== "undefined") s.add("offscreen-canvas");
  if (typeof createImageBitmap === "function") s.add("createImageBitmap");
  if (typeof WebAssembly !== "undefined") {
    s.add("wasm");
    try {
      const simd = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
        10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ]);
      if (WebAssembly.validate(simd)) s.add("wasm-simd");
    } catch { /* ignore */ }
  }
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) s.add("webgpu");
  } catch { /* ignore */ }

  cached = s;
  return s;
}

export function __resetCompatCacheForTests(): void { cached = null; }
