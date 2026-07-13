// Optional browser-first NEURAL super-resolution path.
//
// This is the "Max quality" engine: a real learned super-resolution model
// (SwinIR / Swin2SR lightweight x2) that runs entirely in the user's browser via
// transformers.js — WebGPU when available, CPU/WASM as a fallback. Unlike the
// classical unsharp/Laplacian engine it can synthesise plausible new detail
// instead of only amplifying existing edges.
//
// It is lazy-loaded on first use (the model weights are fetched from the HF CDN
// and cached by the browser), so it never touches the initial bundle. There is
// still NO hosted inference and NO credits — the weights download once, then all
// computation happens on-device.

import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";

// Small, fast, general-purpose super-resolution model (x2). Lightweight variant
// keeps the download and per-image latency reasonable for a browser.
const MODEL_ID = "Xenova/swin2SR-lightweight-x2-64";

// Cap the long edge fed to the model. Neural SR is O(pixels) in both time and
// memory; feeding a already-large upload straight in can OOM the tab. We
// downscale big inputs to this, let the model x2 it, then finish the resample to
// the requested 4K/8K target with the high-quality classical resampler.
const NEURAL_MAX_INPUT = 768;

// Loose types: transformers.js ships its own types but we keep the surface we
// use minimal and defensive so a version bump can't break the build.
type RawImageLike = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  channels: number;
  rgba: () => RawImageLike;
};
type Upscaler = (input: string) => Promise<RawImageLike>;
type ProgressEvent = { status: string; progress?: number; file?: string };

let upscalerPromise: Promise<Upscaler> | null = null;

/** Whether the neural path can even be attempted in this runtime. */
export function neuralSupported(): boolean {
  return typeof document !== "undefined" && typeof createImageBitmap === "function";
}

async function getUpscaler(onLoad?: (p: ProgressEvent) => void): Promise<Upscaler> {
  if (!upscalerPromise) {
    upscalerPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Always fetch from the CDN (no local models bundled) and cache in the
      // browser so repeat runs skip the download.
      env.allowLocalModels = false;
      const device =
        typeof navigator !== "undefined" && (navigator as unknown as { gpu?: unknown }).gpu
          ? "webgpu"
          : "wasm";
      try {
        return (await pipeline("image-to-image", MODEL_ID, {
          device,
          progress_callback: onLoad,
        })) as unknown as Upscaler;
      } catch (err) {
        // WebGPU can advertise but fail to create a device on some machines;
        // retry once on WASM before giving up.
        if (device === "webgpu") {
          return (await pipeline("image-to-image", MODEL_ID, {
            device: "wasm",
            progress_callback: onLoad,
          })) as unknown as Upscaler;
        }
        throw err;
      }
    })().catch((err) => {
      // Allow a later retry (e.g. after a transient network failure).
      upscalerPromise = null;
      throw err;
    });
  }
  return upscalerPromise;
}

function makeMainCanvas(w: number, h: number): CanvasLike {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image."));
    img.src = dataUrl;
  });
}

export interface NeuralResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Enhance `dataUrl` with the neural model, then resample to `finalTarget`.
 * Rejects (so the caller can fall back to the classical engine) if the model or
 * the runtime cannot complete the work.
 */
export async function enhanceNeural(
  dataUrl: string,
  finalTarget: RenderTarget,
  filter: EnhancePixelOptions,
  onProgress?: (value: number, message: string) => void,
  signal?: AbortSignal,
): Promise<NeuralResult> {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Enhancement cancelled.", "AbortError");
  };

  onProgress?.(0.08, "Loading neural model…");
  const upscaler = await getUpscaler((p) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      onProgress?.(0.08 + (p.progress / 100) * 0.32, "Downloading neural model (one time)…");
    }
  });
  throwIfAborted();

  // Prepare the (possibly downscaled) input for the model.
  const img = await loadImageElement(dataUrl);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  let inputSource = dataUrl;
  if (longEdge > NEURAL_MAX_INPUT) {
    const s = NEURAL_MAX_INPUT / longEdge;
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = makeMainCanvas(w, h) as unknown as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    inputSource = c.toDataURL("image/png");
  }
  throwIfAborted();

  onProgress?.(0.45, "Running neural super-resolution…");
  const out = await upscaler(inputSource);
  throwIfAborted();

  // Convert the model output (RawImage) into a canvas we can resample from.
  const out4 = out.channels === 4 ? out : out.rgba();
  const neuralCanvas = makeMainCanvas(out4.width, out4.height) as unknown as HTMLCanvasElement;
  const nctx = neuralCanvas.getContext("2d");
  if (!nctx) throw new Error("2D canvas context unavailable.");
  const id = nctx.createImageData(out4.width, out4.height);
  id.data.set(out4.data as Uint8ClampedArray);
  nctx.putImageData(id, 0, 0);

  onProgress?.(0.82, "Upscaling to target resolution…");
  // Finish to the requested 4K/8K target with the high-quality resampler and a
  // GENTLE detail pass (the model already recovered real detail, so heavy
  // sharpening here would only add ringing).
  const finalCanvas = renderEnhanced(
    neuralCanvas as unknown as CanvasImageSource,
    out4.width,
    out4.height,
    finalTarget,
    filter,
    makeMainCanvas,
  ) as unknown as HTMLCanvasElement;
  throwIfAborted();

  const blob = await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the enhanced image."))),
      "image/png",
    );
  });

  onProgress?.(0.97, "Finishing up…");
  return { blob, width: finalCanvas.width, height: finalCanvas.height };
}
