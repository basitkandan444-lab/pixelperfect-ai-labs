// sRGB <-> Oklab color conversion.
//
// Oklab is a perceptually-uniform color space (Björn Ottosson, 2020). Working
// in Oklab lets us adjust luminance (L) and chroma (a,b) independently, so
// contrast/vibrance/local-contrast operations behave the way a human sees them
// — no hue shifts on saturated boosts, no muddy shadows on contrast lifts.
//
// The transforms here are the reference formulation from
// https://bottosson.github.io/posts/oklab/. All math is dependency-free and
// unit-testable in Node (no canvas, no browser).

/** Convert one sRGB 8-bit channel (0..255) to linear-light (0..1). */
export function srgbToLinear01(v: number): number {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Convert linear-light (0..1) back to sRGB 8-bit (0..255). */
export function linear01ToSrgb(v: number): number {
  const x = v <= 0.0 ? 0 : v >= 1 ? 1 : v;
  const y = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(y * 255);
}

export interface OklabPixel {
  L: number;
  a: number;
  b: number;
}

/** Convert linear-light sRGB triplet (0..1) to Oklab. */
export function linearRgbToOklab(r: number, g: number, b: number): OklabPixel {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/** Convert Oklab back to linear-light sRGB triplet (0..1). May produce values
 * outside [0,1] for out-of-gamut Oklab points — the caller clamps at encode. */
export function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** In-place decode an RGBA byte buffer into three planar Float32 arrays of
 * Oklab (L, a, b) plus a preserved alpha plane. Returns the planes. */
export function rgbaToOklabPlanes(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { L: Float32Array; a: Float32Array; b: Float32Array; alpha: Uint8ClampedArray } {
  const n = width * height;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const alpha = new Uint8ClampedArray(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = srgbToLinear01(rgba[i]);
    const g = srgbToLinear01(rgba[i + 1]);
    const bl = srgbToLinear01(rgba[i + 2]);
    const px = linearRgbToOklab(r, g, bl);
    L[p] = px.L;
    A[p] = px.a;
    B[p] = px.b;
    alpha[p] = rgba[i + 3];
  }
  return { L, a: A, b: B, alpha };
}

/** Encode Oklab planes back to an RGBA byte buffer. */
export function oklabPlanesToRgba(
  L: Float32Array,
  a: Float32Array,
  b: Float32Array,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const [r, g, bl] = oklabToLinearRgb(L[p], a[p], b[p]);
    out[i] = linear01ToSrgb(r);
    out[i + 1] = linear01ToSrgb(g);
    out[i + 2] = linear01ToSrgb(bl);
    out[i + 3] = alpha[p];
  }
  return out;
}
