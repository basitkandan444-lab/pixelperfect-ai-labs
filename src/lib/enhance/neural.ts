// Browser-first NEURAL super-resolution path (the "Balanced (AI)" engine).
//
// Runs a real GAN-based super-resolution network — Real-ESRGAN general x4 v3
// (SRVGGNetCompact) — ENTIRELY in the user's browser via onnxruntime-web, with
// the WebGPU execution provider when available and a WASM/CPU fallback. Unlike
// the classical unsharp/Laplacian engine (which only amplifies existing edges)
// and unlike PSNR-oriented transformer SR (Swin2SR, which over-smooths hair,
// fur and skin at 4×), a GAN restorer synthesises plausible fine texture and is
// the demonstrably stronger choice for real, degraded photos.
//
// Why this model (evidence-based, not popularity-based):
//   - GAN vs transformer SR: on real/old/noisy photos and portraits at 4×,
//     Real-ESRGAN recovers hair/skin/fabric texture that Swin2SR over-smooths
//     (documented head-to-head comparison of Lanczos/Swin2SR/Real-ESRGAN).
//   - Size: this compact "general x4 v3" checkpoint is 2.4 MB — ~20× smaller
//     than the 47 MB Swin2SR weights — so the one-time download is trivial.
//   - Speed: SRVGGNetCompact is a small conv net (verified ~0.18 s for a 96px
//     tile on pure CPU); WebGPU is far faster, vs 8–15 s for Swin2SR.
//   - Shape: the ONNX graph has a fully dynamic input (any H×W), so we can feed
//     the whole capped image in one pass (no fixed-tile stitching artifacts).
//
// The weights are a first-party CDN asset (see the .asset.json import) and the
// onnxruntime WASM binary is fetched once from a pinned CDN, then cached by the
// browser. After that first fetch everything runs on-device and OFFLINE. There
// is NO hosted inference, NO API call for image processing and NO credits.

import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";
import modelAsset from "./realesrgan-x4v3.onnx.asset.json";

// onnxruntime-web is pinned so the JS glue and its WASM binary always agree.
// The WebGPU "bundle" build co-locates its WASM as a fingerprinted asset that
// Vite emits into the client output, so the runtime self-locates it from our
// own deploy (first-party, offline after the first load) — no CDN, no config.
const ORT_VERSION = "1.22.0";

// The network upscales by exactly 4×.
const MODEL_SCALE = 4;

// Cap the long edge fed to the network. Neural SR cost is O(pixels); a compact
// net is light, but a huge upload would still spike memory. We downscale big
// inputs to this, let the model do a real 4× (real detail), then finish to the
// requested 4K/8K target with the high-quality classical resampler.
const NEURAL_MAX_INPUT = 512;

// Minimal structural types over the bits of the onnxruntime-web API we touch, so
// a version bump can't break the typecheck.
interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  env: {
    wasm: { wasmPaths: string; numThreads: number; simd?: boolean; proxy?: boolean };
    logLevel?: string;
  };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create(model: ArrayBuffer, opts: { executionProviders: string[] }): Promise<OrtSession>;
  };
}

let sessionPromise: Promise<{ ort: OrtModule; session: OrtSession }> | null = null;

/**
 * Whether the neural path can run *acceptably* here. It needs a canvas plus
 * WebGPU: the WASM/CPU backend works but is slow enough that the classical
 * engine is a better experience, so we only surface neural when WebGPU exists.
 */
export function neuralSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof navigator !== "undefined" &&
    Boolean((navigator as unknown as { gpu?: unknown }).gpu)
  );
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

async function getSession(
  onProgress?: (value: number, message: string) => void,
): Promise<{ ort: OrtModule; session: OrtSession }> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // Use the WebGPU build and run single-threaded so we don't require
      // cross-origin isolation (COOP/COEP). The "bundle" build self-locates its
      // co-located WASM asset, so we leave wasmPaths untouched.
      const ort = (await import("onnxruntime-web/webgpu")) as unknown as OrtModule;
      void ORT_VERSION;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.logLevel = "error";

      onProgress?.(0.12, "Downloading enhancement model (one time)…");
      const res = await fetch(modelAsset.url);
      if (!res.ok) throw new Error(`Failed to fetch model (${res.status}).`);
      const model = await res.arrayBuffer();

      onProgress?.(0.34, "Starting GPU engine…");
      let session: OrtSession;
      try {
        session = await ort.InferenceSession.create(model, {
          executionProviders: ["webgpu"],
        });
      } catch {
        // WebGPU can advertise but fail to create a device; fall back to WASM.
        session = await ort.InferenceSession.create(model, {
          executionProviders: ["wasm"],
        });
      }
      return { ort, session };
    })().catch((err) => {
      sessionPromise = null; // allow a later retry
      throw err;
    });
  }
  return sessionPromise;
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

  onProgress?.(0.06, "Loading neural engine…");
  const { ort, session } = await getSession(onProgress);
  throwIfAborted();

  // Prepare the (possibly downscaled) input and read its RGBA pixels.
  const img = await loadImageElement(dataUrl);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scaleDown = longEdge > NEURAL_MAX_INPUT ? NEURAL_MAX_INPUT / longEdge : 1;
  const inW = Math.max(1, Math.round(img.naturalWidth * scaleDown));
  const inH = Math.max(1, Math.round(img.naturalHeight * scaleDown));

  const inCanvas = makeMainCanvas(inW, inH) as unknown as HTMLCanvasElement;
  const ictx = inCanvas.getContext("2d");
  if (!ictx) throw new Error("2D canvas context unavailable.");
  ictx.imageSmoothingEnabled = true;
  ictx.imageSmoothingQuality = "high";
  ictx.drawImage(img, 0, 0, inW, inH);
  const rgba = ictx.getImageData(0, 0, inW, inH).data;
  throwIfAborted();

  // RGBA (HWC, 0..255) -> planar RGB (CHW, 0..1) float tensor [1,3,H,W].
  const plane = inW * inH;
  const chw = new Float32Array(3 * plane);
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    chw[p] = rgba[i] / 255;
    chw[p + plane] = rgba[i + 1] / 255;
    chw[p + 2 * plane] = rgba[i + 2] / 255;
  }

  onProgress?.(0.5, "Running neural super-resolution…");
  const feeds: Record<string, OrtTensor> = {
    [session.inputNames[0]]: new ort.Tensor("float32", chw, [1, 3, inH, inW]),
  };
  const results = await session.run(feeds);
  throwIfAborted();

  const out = results[session.outputNames[0]];
  const outH = out.dims[2] as number;
  const outW = out.dims[3] as number;
  const outPlane = outW * outH;
  const od = out.data;

  // Planar RGB (CHW, 0..1) -> RGBA (HWC, 0..255) for a canvas.
  const outCanvas = makeMainCanvas(outW, outH) as unknown as HTMLCanvasElement;
  const octx = outCanvas.getContext("2d");
  if (!octx) throw new Error("2D canvas context unavailable.");
  const outImage = octx.createImageData(outW, outH);
  const oData = outImage.data;
  for (let p = 0, i = 0; p < outPlane; p++, i += 4) {
    oData[i] = Math.max(0, Math.min(255, od[p] * 255));
    oData[i + 1] = Math.max(0, Math.min(255, od[p + outPlane] * 255));
    oData[i + 2] = Math.max(0, Math.min(255, od[p + 2 * outPlane] * 255));
    oData[i + 3] = 255;
  }
  octx.putImageData(outImage, 0, 0);
  void MODEL_SCALE;

  onProgress?.(0.82, "Upscaling to target resolution…");
  // Finish to the requested 4K/8K target with the high-quality resampler and a
  // GENTLE detail pass (the model already recovered real detail, so heavy
  // sharpening here would only add ringing on top of the synthesised texture).
  const finalCanvas = renderEnhanced(
    outCanvas as unknown as CanvasImageSource,
    outW,
    outH,
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
