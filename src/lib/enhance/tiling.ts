// Pure, dependency-free geometry + blending math for TILED neural inference.
//
// The neural super-resolution model (Real-ESRGAN general x4 v3) runs on the
// user's GPU with a bounded amount of VRAM, so a full-resolution image cannot be
// pushed through in a single forward pass. Instead we split the (downscaled-to-
// output-budget) input into overlapping tiles, upscale each tile independently,
// and re-assemble them with a feathered, gamma-correct, weighted average so the
// seams disappear.
//
// EVERYTHING in this file is a pure function over plain numbers / typed arrays:
//   - no canvas, no DOM, no onnxruntime,
// so it is trivially unit-testable in Node and identical on the main thread and
// inside a Web Worker. The DOM/GPU wiring lives in neural.ts.

/** A tile rectangle in INPUT pixel space (pre-upscale). */
export interface TilePlan {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which edges of a tile abut a NEIGHBOUR (and therefore must be feathered). */
export interface TileEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

// ---- sRGB <-> linear-light (gamma-correct blending) -----------------------
//
// Averaging two overlapping tiles in gamma-encoded sRGB darkens/muddies the
// seam. Converting to linear light, averaging, then re-encoding preserves the
// perceived colour exactly across the boundary. Values are 0..1.

export function srgbToLinear(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ---- Tile-size selection ---------------------------------------------------

export interface TileSizeHints {
  /** navigator.deviceMemory in GB, if known. */
  memoryGB?: number | null;
  /** Coarse device tier from capability detection. */
  tier?: "high" | "medium" | "low";
}

export const MIN_TILE_SIZE = 128;
export const MAX_TILE_SIZE = 512;
export const DEFAULT_OVERLAP = 32;
export const MIN_OVERLAP = 16;
export const MAX_OVERLAP = 64;

/**
 * Choose an initial per-tile edge length from the device's memory/tier. Larger
 * tiles = fewer forward passes (faster) but more peak VRAM; the caller retries
 * with a smaller size (see `nextSmallerTile`) if the GPU runs out of memory.
 */
export function pickTileSize(hints: TileSizeHints = {}): number {
  const mem = hints.memoryGB ?? null;
  const tier = hints.tier;
  if (tier === "high" || (mem != null && mem >= 8)) return 512;
  if (tier === "medium" || (mem != null && mem >= 4)) return 384;
  return 256;
}

/** Next tile size to try after a GPU OOM; returns null once below the floor. */
export function nextSmallerTile(current: number): number | null {
  const next = Math.floor(current / 2);
  return next >= MIN_TILE_SIZE ? next : null;
}

/** Clamp an overlap request into the supported band, and below the tile size. */
export function clampOverlap(overlap: number, tile: number): number {
  const o = Math.round(Number.isFinite(overlap) ? overlap : DEFAULT_OVERLAP);
  return Math.max(MIN_OVERLAP, Math.min(MAX_OVERLAP, Math.min(o, Math.max(1, tile - 1))));
}

// ---- Tile planning ---------------------------------------------------------

function tileStarts(total: number, tile: number, stride: number): number[] {
  if (total <= tile) return [0];
  const starts: number[] = [];
  let s = 0;
  // Advance by `stride` until the next tile would overrun; then pin the final
  // tile flush to the far edge so the whole extent is covered.
  while (s + tile < total) {
    starts.push(s);
    s += stride;
  }
  const last = total - tile;
  if (starts.length === 0 || starts[starts.length - 1] !== last) starts.push(last);
  return starts;
}

/**
 * Partition a `width`×`height` input into overlapping tiles. Tiles are laid out
 * on a regular grid advancing by `tile - overlap`; the last row/column is pinned
 * to the far edge (so its overlap with its neighbour may be larger than
 * `overlap`, which the normalised feather blend handles correctly). Output order
 * is deterministic (row-major), guaranteeing identical results run-to-run.
 */
export function planTiles(
  width: number,
  height: number,
  tile: number,
  overlap: number,
): TilePlan[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid tiling dimensions.");
  }
  const t = Math.max(1, Math.min(Math.round(tile), Math.max(width, height)));
  const ov = Math.max(0, Math.min(Math.round(overlap), t - 1));
  const stride = Math.max(1, t - ov);

  const xs = tileStarts(width, t, stride);
  const ys = tileStarts(height, t, stride);

  const tiles: TilePlan[] = [];
  for (const y of ys) {
    for (const x of xs) {
      tiles.push({ x, y, w: Math.min(t, width - x), h: Math.min(t, height - y) });
    }
  }
  return tiles;
}

/** Which edges of `tile` touch a neighbour (interior) vs. the image border. */
export function tileEdges(tile: TilePlan, width: number, height: number): TileEdges {
  return {
    left: tile.x > 0,
    right: tile.x + tile.w < width,
    top: tile.y > 0,
    bottom: tile.y + tile.h < height,
  };
}

// ---- Feather weights -------------------------------------------------------

// Smoothstep is symmetric: smoothstep(t) + smoothstep(1 - t) === 1, so two
// adjacent tiles whose feathers ramp in opposite directions form a partition of
// unity across a regular overlap. Irregular overlaps (the pinned last tile) are
// still correct because the caller NORMALISES by the accumulated weight.
function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function axisWeight(pos: number, len: number, band: number, low: boolean, high: boolean): number {
  let w = 1;
  if (band > 0) {
    if (low) w *= smoothstep((pos + 0.5) / band);
    if (high) w *= smoothstep((len - (pos + 0.5)) / band);
  }
  return w;
}

/**
 * Per-pixel blend weights for one upscaled tile, in OUTPUT pixel space.
 * `outW`×`outH` are the tile's post-upscale dimensions; `band` is the feather
 * width (in output pixels) applied only on edges that touch a neighbour. A tiny
 * floor keeps weights strictly positive so the normalisation divide is safe.
 */
export function tileBlendWeights(
  outW: number,
  outH: number,
  edges: TileEdges,
  band: number,
): Float32Array {
  const w = new Float32Array(outW * outH);
  const b = Math.max(0, Math.min(band, Math.floor(Math.min(outW, outH) / 2)));
  const EPS = 1e-4;
  for (let y = 0; y < outH; y++) {
    const wy = axisWeight(y, outH, b, edges.top, edges.bottom);
    const row = y * outW;
    for (let x = 0; x < outW; x++) {
      const wx = axisWeight(x, outW, b, edges.left, edges.right);
      w[row + x] = Math.max(EPS, wx * wy);
    }
  }
  return w;
}
