// Browser-first enhancement orchestrator.
//
// This is the whole "AI engine": all inference-style work (progressive
// super-resolution resampling + detail recovery) runs on the USER'S device.
// There is no network request, no hosted model, no API key and no credits.
//
// Execution path is chosen from runtime capabilities:
//   - "worker": OffscreenCanvas inside a Web Worker (off the main thread).
//   - "main":   canvas on the main thread (fallback), yielding between passes.

import { detectCapabilities, type EnhanceCapabilities } from "./capabilities";
import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";
import { computeTarget, type Scale } from "./targets";

export type EnhanceStage =
  "preparing" | "detecting" | "decoding" | "upscaling" | "finishing" | "done";

export interface EnhanceProgress {
  stage: EnhanceStage;
  /** 0..1 overall progress. */
  value: number;
  /** Human message for the UI, e.g. "Using GPU acceleration…". */
  message: string;
}

export interface EnhanceOptions {
  scale: Scale;
  /**
   * "classical": instant, zero-download unsharp/Laplacian engine.
   * "neural" (default when supported): lazy-loaded on-device super-resolution
   * transformer (real detail reconstruction via WebGPU), with automatic
   * fallback to classical if the model or GPU is unavailable.
   *
   * Both run 100% in the browser — no network request, no hosted model, no API
   * key, no credits.
   */
  engine?: "classical" | "neural";
  /**
   * "free" (default) or "premium". Premium routes the final upscaled image
   * through the on-device Oklab color pipeline + edge-preserving denoise +
   * CLAHE local contrast + gradient-gated micro-contrast, delivered as a
   * lazy-loaded chunk. Still 100% on-device — no hosted inference, no credits.
   */
  tier?: "free" | "premium";
  signal?: AbortSignal;
  onProgress?: (p: EnhanceProgress) => void;
  /** Injectable for tests; defaults to runtime detection. */
  capabilities?: EnhanceCapabilities;
}

export interface EnhanceResult {
  /** Browser object URL for the enhanced PNG blob. Caller should revoke it. */
  image: string;
  blob: Blob;
  width: number;
  height: number;
  scale: Scale;
  capabilities: EnhanceCapabilities;
  path: "worker" | "main" | "neural";
  durationMs: number;
}

/** Enhancement isn't possible in this browser (no canvas rasteriser). */
export class UnsupportedBrowserError extends Error {
  constructor() {
    super("Browser does not support this enhancement mode.");
    this.name = "UnsupportedBrowserError";
  }
}

function abortError(): DOMException {
  return new DOMException("Enhancement cancelled.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

// Tune the detail filter by quality tier + the actual upscale factor. The
// coarse unsharp radius is matched to the upscale factor so it sharpens the
// soft edges interpolation produces (a fixed 1px radius is below that scale and
// is imperceptible on a 4×/8× upscale). Higher tiers push sharpening harder.
function filterFor(caps: EnhanceCapabilities, factor: number): EnhancePixelOptions {
  // IMAX-Grade Classical Filter: matched radius + extreme details
  const amount = caps.tier === "high" ? 3.8 : caps.tier === "medium" ? 3.4 : 3.0;
  const radius = Math.max(3, Math.min(24, Math.round(factor * 1.5)));
  return {
    amount,
    radius,
    denoise: caps.tier === "low" ? 0.35 : 0.25,
  };
}

// Gentle finishing filter for the neural path: the model has already recovered
// real detail, so we only need a light micro-contrast pass to land the resample
// crisply. Heavy sharpening here would re-introduce ringing on top of the
// synthesised detail.
function neuralFilter(): EnhancePixelOptions {
  return { amount: 0.55, radius: 2, denoise: 0 };
}

async function loadBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image."));
    img.src = dataUrl;
  });
}

// ---- Worker path -----------------------------------------------------------

function runInWorker(
  bitmap: ImageBitmap,
  srcW: number,
  srcH: number,
  target: RenderTarget,
  filter: EnhancePixelOptions,
  signal: AbortSignal | undefined,
  onPass: (value: number) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./enhance.worker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; value?: number; blob?: Blob; message?: string };
      if (msg.type === "progress" && typeof msg.value === "number") {
        onPass(msg.value);
      } else if (msg.type === "done" && msg.blob) {
        cleanup();
        resolve(msg.blob);
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message ?? "Enhancement failed."));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Enhancement worker failed."));
    };

    worker.postMessage({ bitmap, srcW, srcH, target, filter }, [bitmap]);
  });
}

// ---- Main-thread path ------------------------------------------------------

async function runOnMainThread(
  dataUrl: string,
  target: RenderTarget,
  filter: EnhancePixelOptions,
  signal: AbortSignal | undefined,
  onPass: (value: number) => void,
): Promise<{ blob: Blob; srcW: number; srcH: number }> {
  const img = await loadImageElement(dataUrl);
  throwIfAborted(signal);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const canvas = renderEnhanced(
    img,
    srcW,
    srcH,
    target,
    filter,
    (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c as unknown as CanvasLike;
    },
    onPass,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    (canvas as unknown as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the enhanced image."))),
      "image/png",
    );
  });
  return { blob, srcW, srcH };
}

// ---- Public API ------------------------------------------------------------

/**
 * Enhance an image entirely in the browser. Resolves with a PNG data URL and
 * metadata about how the work was performed. The `image` field is a Blob URL,
 * not a base64 data URL; keeping a 4K/8K PNG as a giant string can freeze the
 * preview and make downloads unreliable. Rejects with:
 *   - `UnsupportedBrowserError` if no rasteriser is available,
 *   - a `DOMException("AbortError")` if `signal` is aborted,
 *   - a generic `Error` on decode/encode failure.
 */
export async function enhanceImageInBrowser(
  dataUrl: string,
  opts: EnhanceOptions,
): Promise<EnhanceResult> {
  const started = Date.now();
  const { scale, signal, onProgress } = opts;
  const caps = opts.capabilities ?? detectCapabilities();

  onProgress?.({ stage: "detecting", value: 0.02, message: "Preparing local AI engine…" });
  throwIfAborted(signal);

  if (!caps.supported) throw new UnsupportedBrowserError();

  onProgress?.({
    stage: "preparing",
    value: 0.05,
    message: `Using ${caps.accelLabel}…`,
  });

  // Decode source dimensions. We always decode a bitmap first when available so
  // we can compute the target; the worker path reuses the same bitmap.
  let bitmap: ImageBitmap | null = null;
  let srcW: number;
  let srcH: number;

  const canWorker = caps.path === "worker" && caps.imageBitmap && typeof Worker === "function";

  if (canWorker || caps.imageBitmap) {
    try {
      onProgress?.({ stage: "decoding", value: 0.1, message: "Loading image…" });
      bitmap = await loadBitmap(dataUrl);
      srcW = bitmap.width;
      srcH = bitmap.height;
    } catch {
      bitmap = null;
      const img = await loadImageElement(dataUrl);
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
    }
  } else {
    const img = await loadImageElement(dataUrl);
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
  }
  throwIfAborted(signal);

  const target = computeTarget(srcW, srcH, scale);
  // Match the detail-recovery filter to the actual upscale factor applied.
  const filter = filterFor(caps, target.factor);

  const onPass = (value: number) =>
    onProgress?.({
      stage: "upscaling",
      value: 0.1 + value * 0.85,
      message: `Enhancing with ${caps.accelLabel}…`,
    });

  let blob: Blob;
  let usedPath: "worker" | "main" | "neural" = "main";

  // NEURAL path (opt-in, on-device): real super-resolution transformer,
  // lazy-loaded and run in the browser via WebGPU. Any non-abort failure (no
  // WebGPU, model fetch failure, OOM) falls back to the classical engine so the
  // user always gets a result — and it all stays 100% on-device, offline-capable.
  let neuralDone = false;
  if (opts.engine === "neural") {
    try {
      const { enhanceNeural } = await import("./neural");
      const res = await enhanceNeural(
        dataUrl,
        target,
        neuralFilter(),
        (value, message) =>
          onProgress?.({ stage: "upscaling", value: Math.min(0.97, value), message }),
        signal,
        { memoryGB: caps.memoryGB, tier: caps.tier },
      );
      blob = res.blob;
      usedPath = "neural";
      neuralDone = true;
      bitmap?.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.warn("Neural engine unavailable; falling back to classical engine.", err);
      onProgress?.({
        stage: "upscaling",
        value: 0.1,
        message: "Neural model unavailable — using fast engine…",
      });
    }
  }

  if (!neuralDone) {
    if (canWorker && bitmap) {
      try {
        blob = await runInWorker(bitmap, srcW, srcH, target, filter, signal, onPass);
        usedPath = "worker";
      } catch (err) {
        // A genuine cancel propagates; anything else falls back to the main thread.
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.warn("Enhancement worker failed; falling back to main-thread canvas.", err);
        bitmap?.close();
        const res = await runOnMainThread(dataUrl, target, filter, signal, onPass);
        blob = res.blob;
      }
    } else {
      bitmap?.close();
      const res = await runOnMainThread(dataUrl, target, filter, signal, onPass);
      blob = res.blob;
    }
  }
  throwIfAborted(signal);

  // PREMIUM POST-PASS: on-device perceptual color + edge-preserving denoise +
  // CLAHE local contrast + gradient-gated micro-contrast. Lazy-loaded so free
  // users pay zero bundle cost. Guarded so a browser without OffscreenCanvas /
  // ImageBitmap for reading the blob back still succeeds (falls through).
  if (opts.tier === "premium" && typeof createImageBitmap === "function") {
    try {
      onProgress?.({ stage: "finishing", value: 0.92, message: "Applying premium finish…" });
      const { applyPremiumPost } = await import("./premium/pipeline");
      const bm = await createImageBitmap(blob!);
      const w = bm.width,
        h = bm.height;
      let canvasLike: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== "undefined") {
        canvasLike = new OffscreenCanvas(w, h);
      } else {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        canvasLike = c;
      }
      const ctx = (canvasLike as OffscreenCanvas).getContext("2d") as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (ctx) {
        ctx.drawImage(bm as unknown as CanvasImageSource, 0, 0);
        bm.close();
        const src = ctx.getImageData(0, 0, w, h);
        const outPixels = applyPremiumPost(src.data, w, h, {
          onProgress: (v, m) =>
            onProgress?.({ stage: "finishing", value: 0.92 + v * 0.06, message: m }),
        });
        const outImg = new ImageData(new Uint8ClampedArray(outPixels), w, h);
        ctx.putImageData(outImg, 0, 0);
        blob =
          canvasLike instanceof OffscreenCanvas
            ? await canvasLike.convertToBlob({ type: "image/png" })
            : await new Promise<Blob>((resolve, reject) =>
                (canvasLike as HTMLCanvasElement).toBlob(
                  (b) => (b ? resolve(b) : reject(new Error("Encode failed"))),
                  "image/png",
                ),
              );
      } else {
        bm.close();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.warn("Premium finish failed; using base engine output.", err);
    }
  }

  onProgress?.({ stage: "finishing", value: 0.99, message: "Finishing up…" });
  const image = URL.createObjectURL(blob!);
  onProgress?.({ stage: "done", value: 1, message: "Done" });

  return {
    image,
    blob: blob!,
    width: target.width,
    height: target.height,
    scale,
    capabilities: caps,
    path: usedPath,
    durationMs: Date.now() - started,
  };
}
