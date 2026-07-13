import { describe, it, expect } from "vitest";

import {
  clampOverlap,
  DEFAULT_OVERLAP,
  linearToSrgb,
  MAX_OVERLAP,
  MIN_OVERLAP,
  MIN_TILE_SIZE,
  nextSmallerTile,
  pickTileSize,
  planTiles,
  srgbToLinear,
  tileBlendWeights,
  tileEdges,
} from "./tiling";

describe("srgb <-> linear round-trip", () => {
  it("is an involution within float tolerance across the range", () => {
    for (let i = 0; i <= 20; i++) {
      const c = i / 20;
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 5);
    }
  });

  it("clamps out-of-range values", () => {
    expect(srgbToLinear(-1)).toBe(0);
    expect(srgbToLinear(2)).toBe(1);
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(2)).toBe(1);
  });

  it("darkens correctly in linear space (0.5 sRGB < 0.5 linear)", () => {
    // A mid-grey in sRGB is ~0.214 in linear light — the reason we blend linear.
    expect(srgbToLinear(0.5)).toBeLessThan(0.25);
  });
});

describe("pickTileSize / retry", () => {
  it("scales tile size with memory/tier", () => {
    expect(pickTileSize({ tier: "high" })).toBe(512);
    expect(pickTileSize({ tier: "medium" })).toBe(384);
    expect(pickTileSize({ tier: "low" })).toBe(256);
    expect(pickTileSize({ memoryGB: 16 })).toBe(512);
    expect(pickTileSize({ memoryGB: 2 })).toBe(256);
    expect(pickTileSize({})).toBe(256);
  });

  it("halves tile size on retry and stops at the floor", () => {
    expect(nextSmallerTile(512)).toBe(256);
    expect(nextSmallerTile(256)).toBe(128);
    expect(nextSmallerTile(MIN_TILE_SIZE)).toBeNull();
    expect(nextSmallerTile(200)).toBeNull(); // floor(100) < 128
  });
});

describe("clampOverlap", () => {
  it("keeps overlap within the 16-64 band and below the tile", () => {
    expect(clampOverlap(0, 512)).toBe(MIN_OVERLAP);
    expect(clampOverlap(1000, 512)).toBe(MAX_OVERLAP);
    expect(clampOverlap(DEFAULT_OVERLAP, 512)).toBe(DEFAULT_OVERLAP);
    expect(clampOverlap(60, 40)).toBeLessThan(40);
  });
});

describe("planTiles", () => {
  it("returns a single tile when the image fits", () => {
    const tiles = planTiles(300, 200, 512, 32);
    expect(tiles).toEqual([{ x: 0, y: 0, w: 300, h: 200 }]);
  });

  it("covers every input pixel with overlapping tiles", () => {
    const W = 1000;
    const H = 700;
    const tiles = planTiles(W, H, 256, 32);
    const covered = new Uint8Array(W * H);
    for (const t of tiles) {
      expect(t.x + t.w).toBeLessThanOrEqual(W);
      expect(t.y + t.h).toBeLessThanOrEqual(H);
      for (let y = t.y; y < t.y + t.h; y++) {
        for (let x = t.x; x < t.x + t.w; x++) covered[y * W + x] = 1;
      }
    }
    expect(covered.every((c) => c === 1)).toBe(true);
  });

  it("is deterministic and row-major", () => {
    const a = planTiles(1200, 800, 384, 48);
    const b = planTiles(1200, 800, 384, 48);
    expect(a).toEqual(b);
    // Row-major: y is non-decreasing.
    for (let i = 1; i < a.length; i++) expect(a[i].y).toBeGreaterThanOrEqual(a[i - 1].y);
  });

  it("pins the last tile flush to the far edge", () => {
    const tiles = planTiles(900, 100, 256, 32);
    const maxRight = Math.max(...tiles.map((t) => t.x + t.w));
    expect(maxRight).toBe(900);
  });

  it("throws on invalid dimensions", () => {
    expect(() => planTiles(0, 10, 256, 32)).toThrow();
    expect(() => planTiles(10, Number.NaN, 256, 32)).toThrow();
  });
});

describe("tileEdges", () => {
  it("marks only interior edges as feathered", () => {
    expect(tileEdges({ x: 0, y: 0, w: 100, h: 100 }, 100, 100)).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
    });
    expect(tileEdges({ x: 50, y: 50, w: 50, h: 50 }, 200, 200)).toEqual({
      left: true,
      right: true,
      top: true,
      bottom: true,
    });
  });
});

describe("tileBlendWeights", () => {
  it("is uniform 1 for a lone tile (no interior edges) → no regression path", () => {
    const w = tileBlendWeights(8, 8, { left: false, right: false, top: false, bottom: false }, 16);
    expect(Array.from(w).every((v) => v === 1)).toBe(true);
  });

  it("ramps toward a feathered edge and is strictly positive", () => {
    const outW = 64;
    const w = tileBlendWeights(outW, 64, { left: true, right: false, top: false, bottom: false }, 16);
    expect(w[0]).toBeGreaterThan(0);
    expect(w[0]).toBeLessThan(w[10]);
    expect(w[20]).toBeCloseTo(1, 5); // beyond the feather band → full weight
  });

  it("adjacent complementary feathers form a partition of unity", () => {
    // In the shared overlap region, tile A's RIGHT feather (its last `band`
    // columns) and tile B's LEFT feather (its first `band` columns) map to the
    // same global pixels and must sum to ~1 (smoothstep symmetry) — this is what
    // removes seams. Use a 64² tile so the half-tile clamp does not shrink band.
    const outW = 64;
    const band = 16;
    const wLeft = tileBlendWeights(outW, 8, { left: false, right: true, top: false, bottom: false }, band);
    const wRight = tileBlendWeights(outW, 8, { left: true, right: false, top: false, bottom: false }, band);
    for (let i = 0; i < band; i++) {
      const aRight = wLeft[outW - band + i]; // row 0 of the right feather
      const bLeft = wRight[i]; // row 0 of the left feather
      expect(aRight + bLeft).toBeCloseTo(1, 5);
    }
  });
});
