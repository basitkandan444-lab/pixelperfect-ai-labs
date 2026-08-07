// CacheStorage-backed model store with SHA-256 verification and LRU eviction.
//
// Backed by the browser Cache API when available; falls back to a plain fetch
// each time (still correct, just uncached). SSR-safe: the guarded getters
// short-circuit when `caches` is undefined.

const CACHE_NAME = "ppp-models-v1";
const MAX_BYTES = 150 * 1024 * 1024;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cachesAvailable(): boolean {
  return typeof caches !== "undefined" && !import.meta.env.SSR;
}

interface CachedMeta {
  url: string;
  size: number;
  ts: number;
}

const META_KEY = "/__ppp_models_meta__";

async function readMeta(cache: Cache): Promise<CachedMeta[]> {
  const res = await cache.match(META_KEY);
  if (!res) return [];
  try {
    return (await res.json()) as CachedMeta[];
  } catch {
    return [];
  }
}

async function writeMeta(cache: Cache, meta: CachedMeta[]) {
  await cache.put(
    META_KEY,
    new Response(JSON.stringify(meta), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function evictIfOver(cache: Cache) {
  const meta = await readMeta(cache);
  let total = meta.reduce((s, m) => s + m.size, 0);
  meta.sort((a, b) => a.ts - b.ts);
  const kept: CachedMeta[] = [];
  for (const m of meta.reverse()) {
    if (total <= MAX_BYTES) {
      kept.push(m);
      continue;
    }
    await cache.delete(m.url);
    total -= m.size;
  }
  await writeMeta(cache, kept);
}

export interface FetchModelOptions {
  url: string;
  sha256?: string;
  signal?: AbortSignal;
  onProgress?: (bytesLoaded: number, bytesTotal: number) => void;
}

/** Fetch and verify a model, using CacheStorage when available. Returns the
 * raw bytes. Throws on hash mismatch or abort. */
export async function fetchModel(opts: FetchModelOptions): Promise<ArrayBuffer> {
  const { url, sha256, signal, onProgress } = opts;
  if (cachesAvailable()) {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      if (!sha256 || (await sha256Hex(buf)) === sha256) return buf;
      // Corrupted or version-drifted: drop and refetch below.
      await cache.delete(url);
    }
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let loaded = 0;
  const chunks: Uint8Array[] = [];
  if (res.body && onProgress) {
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  } else {
    chunks.push(new Uint8Array(await res.arrayBuffer()));
  }
  const buf = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  const ab = buf.buffer.slice(0);
  if (sha256) {
    const got = await sha256Hex(ab);
    if (got !== sha256) throw new Error(`Model hash mismatch for ${url}`);
  }
  if (cachesAvailable()) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(ab.slice(0), {
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const meta = await readMeta(cache);
    const filtered = meta.filter((m) => m.url !== url);
    filtered.push({ url, size: ab.byteLength, ts: Date.now() });
    await writeMeta(cache, filtered);
    await evictIfOver(cache);
  }
  return ab;
}

/** Test/tooling helper: clear the model cache. Safe on SSR. */
export async function clearModelCache() {
  if (!cachesAvailable()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* ignore */
  }
}
