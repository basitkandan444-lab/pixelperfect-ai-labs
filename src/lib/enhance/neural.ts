// Browser-first NEURAL super-resolution path (the "Balanced (AI)" engine).
//
// A real learned super-resolution transformer (Swin2SR) that runs ENTIRELY in
// the user's browser via transformers.js — WebGPU when available, CPU/WASM as a
// fallback. Unlike the classical unsharp/Laplacian engine it reconstructs
// plausible new detail (edges, texture) instead of only amplifying what already
// exists.
//
// Model choice — evidence-based, not popularity-based:
//   We use the *real-world* x4 Swin2SR checkpoint trained with BSRGAN-style
//   degradations (blur + noise + JPEG compression), NOT the lightweight bicubic
//   x2 model. Real user uploads are degraded photos, so a network trained only
//   on clean bicubic-downscaled inputs (lightweight-x2) generalises poorly and
//   amplifies artifacts. The real-world checkpoint is trained specifically to
//   undo real degradation, so it removes JPEG blocking / noise while recovering
//   edges — measurably closer to elite restoration within browser-only limits.
//   It also performs 4× of the upscale in the neural domain (vs 2×), leaving
//   less work for the classical resampler and yielding sharper large outputs.
//
// It is lazy-loaded on first use (weights fetched from the HF CDN, then cached
// by the browser), so it never touches the initial bundle. There is NO hosted
// inference and NO credits — the weights download once, then ALL computation
// happens on-device and it works fully offline afterwards.

import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";

// Real-world super-resolution transformer (x4), trained on realistic
// degradations (blur/noise/JPEG). Strongest general-purpose SR checkpoint in the
// transformers.js catalog that stays practical for on-device WebGPU inference.
const MODEL_ID = "Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr";

// Cap the long edge fed to the model. Neural SR is O(pixels) in both time and
// memory; feeding an already-large upload straight in can OOM the tab. Because
// this model is x4 (16× the pixels out), we keep the input smaller than the x2
// path used, let the model x4 it, then finish the resample to the requested
// 4K/8K target with the high-quality classical resampler.
const NEURAL_MAX_INPUT = 512;

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

/**
 * Whether the neural path can run *acceptably* here. It requires a canvas plus
 * WebGPU: the CPU/WASM backend is functional but so slow (tens of seconds to
 * minutes for a single image) that it is a worse experience than the classical
 * engine, so we only surface neural when the GPU path is available.
 */
export function neuralSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof navigator !== "undefined" &&
    Boolean((navigator as unknown as { gpu?: unknown }).gpu)
  );
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
