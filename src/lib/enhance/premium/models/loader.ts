// Lazy model loader — memoises the underlying ArrayBuffer per model id, so
// repeat enhance runs skip both the network and the SHA-256 verification.
//
// The premium pipeline holds the model bytes; wiring these bytes into an ORT
// InferenceSession is the responsibility of the stage that uses the model (so
// unused models don't pull ORT into the graph).

import { fetchModel } from "./cache";
import { getModel } from "./registry";

const inflight = new Map<string, Promise<ArrayBuffer>>();
const resolved = new Map<string, ArrayBuffer>();

export interface LoadModelOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

/** Load a registered model. Returns cached bytes on subsequent calls. */
export function loadModel(id: string, opts: LoadModelOptions = {}): Promise<ArrayBuffer> {
  const cached = resolved.get(id);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(id);
  if (pending) return pending;
  const entry = getModel(id);
  if (!entry) return Promise.reject(new Error(`Unknown model: ${id}`));
  const p = fetchModel({
    url: entry.url, sha256: entry.sha256, signal: opts.signal, onProgress: opts.onProgress,
  }).then((buf) => {
    resolved.set(id, buf);
    inflight.delete(id);
    return buf;
  }, (err) => {
    inflight.delete(id);
    throw err;
  });
  inflight.set(id, p);
  return p;
}

/** Test/tooling helper. */
export function __resetLoaderForTests() {
  inflight.clear();
  resolved.clear();
}
