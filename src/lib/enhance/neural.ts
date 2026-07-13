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
// PHASE 1 — TILED INFERENCE (this file's headline change):
//   The previous implementation downscaled every input to a 512px proxy before
//   the single forward pass, so "4K/8K" output was mostly a classical resample
//   of a 4× upscale of a thumbnail. We now run the model over the FULL-RESOLUTION
//   input (bounded only by the output pixel budget, which is the real browser
//   memory limit) by splitting it into overlapping tiles, upscaling each tile
//   independently, and reassembling them with a feathered, gamma-correct,
//   normalised weighted average that is seam-free and deterministic regardless
//   of tile order. Per-tile VRAM is bounded and tiles run sequentially, so peak
//   memory stays low; if the GPU still OOMs we retry with smaller tiles.
//
// Everything remains 100% on-device and OFFLINE after the first load: the
// weights are a first-party asset and the onnxruntime WASM binary is fetched
// once, then cached. There is NO hosted inference, NO API call for image
// processing and NO credits.

import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";
import modelAsset from "./realesrgan-x4v3.onnx.asset.json";
import {
  clampOverlap,
  DEFAULT_OVERLAP,
  linearToSrgb,
  nextSmallerTile,
  pickTileSize,
  planTiles,
  srgbToLinear,
  tileBlendWeights,
  tileEdges,
  type TileSizeHints,
} from "./tiling";

// onnxruntime-web is pinned so the JS glue and its WASM binary always agree.
// The WebGPU "bundle" build co-locates its WASM as a fingerprinted asset that
// Vite emits into the client output, so the runtime self-locates it from our
// own deploy (first-party, offline after the first load) — no CDN, no config.
const ORT_VERSION = "1.22.0";

// The network upscales by exactly 4×.
const MODEL_SCALE = 4;

// Feather band (in INPUT pixels) applied on tile edges that touch a neighbour.
const TILE_OVERLAP = DEFAULT_OVERLAP;

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

      onProgress?.(0.28, "Starting GPU engine…");
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

// A rejected forward pass is treated as a memory pressure signal (WebGPU device
// lost / buffer allocation failure surface with varied, unstable messages), so
// the caller retries at a smaller tile size before giving up on the neural path.
function looksLikeMemoryError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    m.includes("memory") ||
    m.includes("oom") ||
    m.includes("alloc") ||
    m.includes("buffer") ||
    m.includes("device lost") ||
    m.includes("out of") ||
    m.includes("exceeds")
  );
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("2D canvas context unavailable.");
  return c;
}

/**
 * Run the model over `inCanvas` (INPUT pixels) tile-by-tile and return a canvas
 * at MODEL_SCALE× resolution. Tiles are processed sequentially (bounded peak
 * memory), each tile's buffers are released immediately, and the results are
 * combined with a normalised, gamma-correct feather blend so the output is
 * seam-free and identical regardless of tile order.
 */
async function runTiled(
  ort: OrtModule,
  session: OrtSession,
  inCanvas: HTMLCanvasElement,
  inW: number,
  inH: number,
  tileSize: number,
  onTileProgress: (done: number, total: number) => void,
  throwIfAborted: () => void,
): Promise<HTMLCanvasElement> {
  const overlap = clampOverlap(TILE_OVERLAP, tileSize);
  const tiles = planTiles(inW, inH, tileSize, overlap);
  const outW = inW * MODEL_SCALE;
  const outH = inH * MODEL_SCALE;

  const ictx = ctx2d(inCanvas);

  // FAST PATH — single tile (small images). No blending, no gamma round-trip:
  // byte-for-byte the pre-tiling behaviour, guaranteeing zero regression.
  if (tiles.length === 1) {
    const rgba = ictx.getImageData(0, 0, inW, inH).data;
    const out = await runModel(ort, session, rgba, inW, inH);
    throwIfAborted();
    const canvas = makeMainCanvas(outW, outH) as unknown as HTMLCanvasElement;
    const octx = ctx2d(canvas);
    const img = octx.createImageData(outW, outH);
    const od = out.data;
    const plane = outW * outH;
    for (let p = 0, i = 0; p < plane; p++, i += 4) {
      img.data[i] = clamp255(od[p] * 255);
      img.data[i + 1] = clamp255(od[p + plane] * 255);
      img.data[i + 2] = clamp255(od[p + 2 * plane] * 255);
      img.data[i + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    onTileProgress(1, 1);
    return canvas;
  }

  // Accumulators in LINEAR light + a weight plane, so the final divide yields a
  // gamma-correct, order-independent weighted average.
  const accR = new Float32Array(outW * outH);
  const accG = new Float32Array(outW * outH);
  const accB = new Float32Array(outW * outH);
  const accW = new Float32Array(outW * outH);

  const band = overlap * MODEL_SCALE;

  for (let t = 0; t < tiles.length; t++) {
    throwIfAborted();
    const tile = tiles[t];
    const rgba = ictx.getImageData(tile.x, tile.y, tile.w, tile.h).data;
    const out = await runModel(ort, session, rgba, tile.w, tile.h);
    throwIfAborted();

    const tOutW = out.dims[3] as number;
    const tOutH = out.dims[2] as number;
    const weights = tileBlendWeights(tOutW, tOutH, tileEdges(tile, inW, inH), band);
    const od = out.data;
    const tPlane = tOutW * tOutH;
    const ox = tile.x * MODEL_SCALE;
    const oy = tile.y * MODEL_SCALE;

    for (let ly = 0; ly < tOutH; ly++) {
      const gy = oy + ly;
      if (gy >= outH) break;
      const dstRow = gy * outW;
      const srcRow = ly * tOutW;
      for (let lx = 0; lx < tOutW; lx++) {
        const gx = ox + lx;
        if (gx >= outW) break;
        const w = weights[srcRow + lx];
        const s = srcRow + lx;
        const d = dstRow + gx;
        accR[d] += w * srgbToLinear(od[s]);
        accG[d] += w * srgbToLinear(od[s + tPlane]);
        accB[d] += w * srgbToLinear(od[s + 2 * tPlane]);
        accW[d] += w;
      }
    }

    // Release this tile's buffers before the next pass and yield so the GPU can
    // reclaim memory and the UI thread stays responsive.
    (out as { data: Float32Array | null }).data = null;
    onTileProgress(t + 1, tiles.length);
    await yieldToRuntime();
  }

  const canvas = makeMainCanvas(outW, outH) as unknown as HTMLCanvasElement;
  const octx = ctx2d(canvas);
  const img = octx.createImageData(outW, outH);
  const dst = img.data;
  const plane = outW * outH;
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    const wsum = accW[p] || 1;
    dst[i] = clamp255(linearToSrgb(accR[p] / wsum) * 255);
    dst[i + 1] = clamp255(linearToSrgb(accG[p] / wsum) * 255);
    dst[i + 2] = clamp255(linearToSrgb(accB[p] / wsum) * 255);
    dst[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return canvas;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Convert one RGBA tile (HWC 0..255) -> planar RGB (CHW 0..1), run the model,
// and return the output tensor [1,3,H*4,W*4].
async function runModel(
  ort: OrtModule,
  session: OrtSession,
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Promise<OrtTensor> {
  const plane = w * h;
  const chw = new Float32Array(3 * plane);
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    chw[p] = rgba[i] / 255;
    chw[p + plane] = rgba[i + 1] / 255;
    chw[p + 2 * plane] = rgba[i + 2] / 255;
  }
  const feeds: Record<string, OrtTensor> = {
    [session.inputNames[0]]: new ort.Tensor("float32", chw, [1, 3, h, w]),
  };
  const results = await session.run(feeds);
  return results[session.outputNames[0]];
}

function yieldToRuntime(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  hints?: TileSizeHints,
): Promise<NeuralResult> {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Enhancement cancelled.", "AbortError");
  };

  onProgress?.(0.06, "Loading neural engine…");
  const { ort, session } = await getSession(onProgress);
  throwIfAborted();

  // Determine the INPUT resolution the model actually sees. We feed the image at
  // full resolution, bounded only by the output pixel budget (the real browser
  // memory limit): the model's 4× output must land within `finalTarget`, so cap
  // the input long edge at finalTarget/4. Small images are fed at native
  // resolution (never upscaled before the model). This replaces the old fixed
  // 512px proxy — the model now processes real detail.
  const img = await loadImageElement(dataUrl);
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const srcLong = Math.max(natW, natH);
  const outCapLong = Math.max(finalTarget.width, finalTarget.height);
  const inCapLong = Math.max(1, Math.floor(outCapLong / MODEL_SCALE));
  const scaleDown = srcLong > inCapLong ? inCapLong / srcLong : 1;
  const inW = Math.max(1, Math.round(natW * scaleDown));
  const inH = Math.max(1, Math.round(natH * scaleDown));

  const inCanvas = makeMainCanvas(inW, inH) as unknown as HTMLCanvasElement;
  const ictx = ctx2d(inCanvas);
  ictx.imageSmoothingEnabled = true;
  ictx.imageSmoothingQuality = "high";
  ictx.drawImage(img, 0, 0, inW, inH);
  throwIfAborted();

  // ADAPTIVE TILE SIZING + RETRY: pick an initial tile from device memory/tier;
  // on a GPU OOM, halve the tile size and retry the whole tiled pass (bounded by
  // MIN_TILE_SIZE) before surfacing failure to the caller's classical fallback.
  let tileSize: number | null = pickTileSize(hints);
  let outCanvas: HTMLCanvasElement | null = null;
  let lastErr: unknown = null;

  while (tileSize !== null) {
    try {
      onProgress?.(0.5, "Running neural super-resolution…");
      outCanvas = await runTiled(
        ort,
        session,
        inCanvas,
        inW,
        inH,
        tileSize,
        (done, total) =>
          onProgress?.(
            0.5 + (done / total) * 0.32,
            total > 1 ? `Enhancing tile ${done}/${total}…` : "Running neural super-resolution…",
          ),
        throwIfAborted,
      );
      break;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastErr = err;
      if (!looksLikeMemoryError(err)) throw err;
      const smaller = nextSmallerTile(tileSize);
      if (smaller === null) throw lastErr;
      tileSize = smaller;
      onProgress?.(0.5, "Reducing tile size to fit GPU memory…");
      await yieldToRuntime();
    }
  }

  if (!outCanvas) throw lastErr ?? new Error("Tiled inference failed.");

  onProgress?.(0.86, "Upscaling to target resolution…");
  // Finish to the requested 4K/8K target with the high-quality resampler and a
  // GENTLE detail pass (the model already recovered real detail, so heavy
  // sharpening here would only add ringing on top of the synthesised texture).
  const finalCanvas = renderEnhanced(
    outCanvas as unknown as CanvasImageSource,
    outCanvas.width,
    outCanvas.height,
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
