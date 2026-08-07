// Tiny memory helpers used across the premium pipeline.
//
// A common Float32Array/Uint8ClampedArray allocation dance shows up in every
// stage; pooling them prevents GC churn on large images without adding a real
// dependency or complexity.

type Pooled = Float32Array | Uint8ClampedArray;

interface Pool<T extends Pooled> {
  buckets: Map<number, T[]>;
  make: (n: number) => T;
}

function makePool<T extends Pooled>(make: (n: number) => T): Pool<T> {
  return { buckets: new Map(), make };
}

const f32 = makePool<Float32Array>((n) => new Float32Array(n));
const u8c = makePool<Uint8ClampedArray>((n) => new Uint8ClampedArray(n));

function acquire<T extends Pooled>(pool: Pool<T>, size: number): T {
  const list = pool.buckets.get(size);
  if (list && list.length) return list.pop()!;
  return pool.make(size);
}

function release<T extends Pooled>(pool: Pool<T>, buf: T): void {
  const list = pool.buckets.get(buf.length);
  if (list) list.push(buf);
  else pool.buckets.set(buf.length, [buf]);
}

export function acquireF32(n: number): Float32Array {
  return acquire(f32, n);
}
export function releaseF32(buf: Float32Array): void {
  release(f32, buf);
}
export function acquireU8C(n: number): Uint8ClampedArray {
  return acquire(u8c, n);
}
export function releaseU8C(buf: Uint8ClampedArray): void {
  release(u8c, buf);
}

/** Drop pooled buffers (e.g. on route change). */
export function clearPools() {
  f32.buckets.clear();
  u8c.buckets.clear();
}
