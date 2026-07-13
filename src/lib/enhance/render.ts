// Shared canvas rendering routine for the browser upscaler.
//
// Deliberately DOM-agnostic: it takes a `makeCanvas` factory so the SAME code
// runs on the main thread (HTMLCanvasElement) and inside a Web Worker
// (OffscreenCanvas). It performs progressive high-quality resampling followed by
// the detail-recovery filter pass.

import { enhancePixels, type EnhancePixelOptions } from "./filters";

// Minimal structural type covering the 2D context methods we use, so we don't
// depend on the (incompatible) HTMLCanvas vs OffscreenCanvas context unions.
interface Ctx2D {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  putImageData(data: ImageData, dx: number, dy: number): void;
  createImageData(sw: number, sh: number): ImageData;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): unknown;
}

export type CanvasFactory = (w: number, h: number) => CanvasLike;

export interface RenderTarget {
  width: number;
  height: number;
  passes: number;
}

function ctxOf(canvas: CanvasLike): Ctx2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable.");
  return ctx as Ctx2D;
}

/**
 * Progressively upscale `source` to `target`, then apply the detail filter.
 * Returns the final canvas (caller extracts a blob/data URL from it).
 */
export function renderEnhanced(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  target: RenderTarget,
  filter: EnhancePixelOptions,
  makeCanvas: CanvasFactory,
  onProgress?: (value: number) => void,
): CanvasLike {
  // Seed a canvas at the source resolution.
  let current = makeCanvas(srcW, srcH);
  const seed = ctxOf(current);
  seed.imageSmoothingEnabled = true;
  seed.imageSmoothingQuality = "high";
  seed.drawImage(source, 0, 0, srcW, srcH);

  const passes = Math.max(1, target.passes);
  for (let i = 1; i <= passes; i++) {
    const t = i / passes;
    // Interpolate the intermediate size linearly toward the target; the final
    // pass lands exactly on the target dimensions.
    const w = Math.max(1, Math.round(srcW + (target.width - srcW) * t));
    const h = Math.max(1, Math.round(srcH + (target.height - srcH) * t));
    const next = makeCanvas(w, h);
    const nctx = ctxOf(next);
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(current as unknown as CanvasImageSource, 0, 0, w, h);
    current = next;
    onProgress?.(0.1 + t * 0.7);
  }

  // Detail-recovery pass on the final, full-resolution buffer.
  const fctx = ctxOf(current);
  const image = fctx.getImageData(0, 0, current.width, current.height);
  const enhanced = enhancePixels(image.data, current.width, current.height, filter);
  const outImage = fctx.createImageData(current.width, current.height);
  outImage.data.set(enhanced);
  fctx.putImageData(outImage, 0, 0);
  onProgress?.(0.98);

  return current;
}
