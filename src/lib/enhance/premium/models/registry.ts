// Static manifest of on-device models the premium engine may use.
//
// Only models declared here can be fetched. Every entry carries a SHA-256 so
// the cache layer can verify the payload before use. Adding a hosted model
// remains explicitly out of scope — every entry is either bundled or served
// from the project's first-party asset host.

export interface ModelEntry {
  id: string;
  /** Absolute or relative URL. Fetched lazily by the loader. */
  url: string;
  /** Uncompressed size in bytes. Used for cache accounting only. */
  size: number;
  /** SHA-256 hex digest of the exact bytes at `url`. */
  sha256?: string;
  purpose: "upscale" | "faceRestore";
}

export const MODEL_REGISTRY: Readonly<Record<string, ModelEntry>> = Object.freeze({
  "realesrgan-x4v3": {
    id: "realesrgan-x4v3",
    url: "/__l5e/assets-v1/275520f6-33d5-44d4-9d55-62b446c07237/realesrgan-x4v3.onnx",
    size: 2_445_042,
    purpose: "upscale",
  },
  // Face model is declared but not shipped: the loader will attempt fetch only
  // after explicit user consent. If unreachable, the pipeline drops the stage.
  "gfpgan-v14-fp16": {
    id: "gfpgan-v14-fp16",
    url: "/models/gfpgan-v14-fp16.onnx",
    size: 40_000_000,
    purpose: "faceRestore",
  },
});

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY[id];
}
