// Client helper for the hosted "Max / Studio" enhancement path.
//
// It calls the server route (/api/enhance-max), which runs a real
// image-restoration model via the Lovable AI Gateway, then upscales the restored
// image to the requested 4K/8K target with the high-quality resampler + a gentle
// finishing pass. There is a real per-image AI cost here (unlike the free
// on-device engines), so this path is strictly opt-in.

import type { EnhancePixelOptions } from "./filters";
import { renderEnhanced, type CanvasLike, type RenderTarget } from "./render";

/** Raised when the hosted endpoint returns a non-2xx status. */
export class HostedEnhanceError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "HostedEnhanceError";
    this.status = status;
    this.code = code;
  }
}

export interface HostedResult {
  blob: Blob;
  width: number;
  height: number;
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
    img.onerror = () => reject(new Error("Could not decode the enhanced image."));
    img.src = dataUrl;
  });
}

/**
 * Restore `dataUrl` with the hosted AI model, then resample to `finalTarget`.
 * Throws `HostedEnhanceError` (with the server's message + status) on failure so
 * the UI can surface an accurate reason (e.g. out of credits) instead of a
 * generic error.
 */
export async function enhanceHosted(
  dataUrl: string,
  finalTarget: RenderTarget,
  filter: EnhancePixelOptions,
  onProgress?: (value: number, message: string) => void,
  signal?: AbortSignal,
): Promise<HostedResult> {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Enhancement cancelled.", "AbortError");
  };

  onProgress?.(0.15, "Sending to Studio AI…");
  throwIfAborted();

  let res: Response;
  try {
    res = await fetch("/api/enhance-max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new HostedEnhanceError("Could not reach the AI service. Please try again.", 0);
  }

  if (!res.ok) {
    let message = "AI enhancement failed.";
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      /* keep default message */
    }
    throw new HostedEnhanceError(message, res.status, code);
  }

  onProgress?.(0.7, "Restoring detail…");
  const { image } = (await res.json()) as { image?: string };
  if (!image) throw new HostedEnhanceError("AI enhancement returned no image.", 502);
  throwIfAborted();

  // Draw the restored image, then upscale to the requested 4K/8K target.
  const restored = await loadImageElement(image);
  const seed = makeMainCanvas(restored.naturalWidth, restored.naturalHeight);

  onProgress?.(0.85, "Upscaling to target resolution…");
  const finalCanvas = renderEnhanced(
    restored,
    restored.naturalWidth,
    restored.naturalHeight,
    finalTarget,
    filter,
    makeMainCanvas,
  ) as unknown as HTMLCanvasElement;
  void seed;
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
