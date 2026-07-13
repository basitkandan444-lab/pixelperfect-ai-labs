/// <reference lib="webworker" />
// Off-main-thread enhancement worker.
//
// Receives an ImageBitmap + target dimensions + filter params, performs the
// progressive upscale and detail-recovery pass on an OffscreenCanvas (so the
// heavy pixel work never blocks the UI thread), and returns a PNG blob.

import { renderEnhanced, type CanvasLike } from "./render";
import type { EnhancePixelOptions } from "./filters";
import type { RenderTarget } from "./render";

interface EnhanceRequest {
  bitmap: ImageBitmap;
  srcW: number;
  srcH: number;
  target: RenderTarget;
  filter: EnhancePixelOptions;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<EnhanceRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (event: MessageEvent<EnhanceRequest>) => {
  const { bitmap, srcW, srcH, target, filter } = event.data;
  try {
    const canvas = renderEnhanced(
      bitmap,
      srcW,
      srcH,
      target,
      filter,
      (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
      (value) => scope.postMessage({ type: "progress", value }),
    );
    const blob = await (canvas as unknown as OffscreenCanvas).convertToBlob({ type: "image/png" });
    bitmap.close();
    scope.postMessage({ type: "done", blob });
  } catch (err) {
    scope.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Enhancement failed.",
    });
  }
};
