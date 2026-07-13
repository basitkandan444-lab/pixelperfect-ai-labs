// Runtime capability detection for the browser-first enhancement engine.
//
// The result drives (a) which execution path the pipeline takes (Web Worker +
// OffscreenCanvas vs. main-thread canvas) and (b) the human-readable status the
// UI shows ("Using GPU acceleration…" etc.). Detection is defensive: every
// probe is wrapped so a hostile/locked-down browser can never throw here.

export type ExecutionPath = "worker" | "main";
export type AccelKind = "gpu" | "cpu";
export type DeviceTier = "high" | "medium" | "low";

export interface EnhanceCapabilities {
  /** WebGPU adapter surface present (navigator.gpu). */
  webgpu: boolean;
  /** WebGL context obtainable — canvas work is GPU-composited. */
  webgl: boolean;
  /** OffscreenCanvas available (required for off-main-thread rendering). */
  offscreenCanvas: boolean;
  /** Web Worker constructor available. */
  worker: boolean;
  /** createImageBitmap available (fast decode path). */
  imageBitmap: boolean;
  /** Logical CPU cores (navigator.hardwareConcurrency), best-effort. */
  cores: number;
  /** Device memory in GB (navigator.deviceMemory), or null if unknown. */
  memoryGB: number | null;
  /** Whether any hosted enhancement is supported at all in this browser. */
  supported: boolean;
  /** Chosen execution path. */
  path: ExecutionPath;
  /** Whether the heavy work is GPU-composited or pure CPU. */
  accel: AccelKind;
  /** Human label for the UI, e.g. "GPU acceleration". */
  accelLabel: string;
  /** Coarse performance tier for tuning quality vs. speed. */
  tier: DeviceTier;
}

// A minimal structural view of the globals we probe, so tests can inject fakes.
export interface DetectionGlobals {
  navigator?: {
    gpu?: unknown;
    hardwareConcurrency?: number;
    deviceMemory?: number;
  };
  OffscreenCanvas?: unknown;
  Worker?: unknown;
  createImageBitmap?: unknown;
  document?: { createElement?: (tag: string) => unknown };
}

function hasWebGL(g: DetectionGlobals): boolean {
  // Prefer OffscreenCanvas (works in workers too); fall back to a DOM canvas.
  try {
    const OC = g.OffscreenCanvas as (new (w: number, h: number) => unknown) | undefined;
    if (typeof OC === "function") {
      const c = new OC(1, 1) as { getContext?: (id: string) => unknown };
      if (typeof c.getContext === "function") {
        return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
      }
    }
    const doc = g.document;
    if (doc && typeof doc.createElement === "function") {
      const c = doc.createElement("canvas") as { getContext?: (id: string) => unknown };
      if (c && typeof c.getContext === "function") {
        return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
      }
    }
  } catch {
    // ignore — treated as no WebGL
  }
  return false;
}

function classifyTier(cores: number, memoryGB: number | null, gpu: boolean): DeviceTier {
  const mem = memoryGB ?? 4;
  if (gpu && cores >= 8 && mem >= 8) return "high";
  if (cores >= 4 && mem >= 4) return "medium";
  return "low";
}

/**
 * Detect the enhancement capabilities of the current runtime. Pass a `globals`
 * object in tests; defaults to `globalThis` in the browser.
 */
export function detectCapabilities(globals?: DetectionGlobals): EnhanceCapabilities {
  const g = (globals ?? (globalThis as unknown as DetectionGlobals)) || {};
  const nav = g.navigator ?? {};

  const webgpu = Boolean(nav.gpu);
  const webgl = hasWebGL(g);
  const offscreenCanvas = typeof g.OffscreenCanvas === "function";
  const worker = typeof g.Worker === "function";
  const imageBitmap = typeof g.createImageBitmap === "function";

  const cores = Math.max(1, Number(nav.hardwareConcurrency) || 4);
  const memoryGB = Number.isFinite(Number(nav.deviceMemory)) ? Number(nav.deviceMemory) : null;

  // The pipeline needs a way to rasterise. If neither OffscreenCanvas nor a DOM
  // canvas is available we cannot enhance in-browser.
  const canRaster =
    offscreenCanvas || Boolean(g.document && typeof g.document.createElement === "function");
  const supported = canRaster;

  // Prefer the worker path only when we can move a canvas off the main thread.
  const path: ExecutionPath = worker && offscreenCanvas ? "worker" : "main";

  // Canvas 2D scaling is GPU-composited when WebGL/WebGPU exists; otherwise the
  // browser falls back to a CPU rasteriser. Report that honestly to the user.
  const accel: AccelKind = webgpu || webgl ? "gpu" : "cpu";
  const accelLabel = accel === "gpu" ? "GPU acceleration" : "CPU acceleration";

  return {
    webgpu,
    webgl,
    offscreenCanvas,
    worker,
    imageBitmap,
    cores,
    memoryGB,
    supported,
    path,
    accel,
    accelLabel,
    tier: classifyTier(cores, memoryGB, webgpu || webgl),
  };
}
