# Task 5 + 6 — Premium Browser-First Enhancement

## Non-negotiables (preserved)
- 100% on-device. No hosted inference, no API calls, no credits.
- Free tier and Stripe/entitlement gates (Tasks 1–4) untouched.
- Existing `enhanceImageInBrowser` API stable; classical + neural engines preserved as fallbacks.
- SSR-safe: neural + premium modules only imported dynamically on the client.

## What premium users get (visible upgrades)
1. **Higher-fidelity upscale** — same Real-ESRGAN x4 v3 GAN as free neural, but with:
   - Larger tile size when memory allows (sharper seams, fewer artefacts).
   - **2-pass tile blending in linear light** with cosine-feathered weights (already gamma-correct — extend to overlap = tileSize/4 on premium).
   - Optional **8×** via cascaded 4× → downscale-to-target using Lanczos for true detail at 8K.
2. **Face restoration** — lazy-loaded **GFPGAN v1.4 (small ONNX)** run only on detected face regions (browser `FaceDetector` API with fallback to a lightweight blazeface WASM). Composited back with feathered mask. Skipped when no faces.
3. **Premium color/tone** — perceptual pipeline in Oklab: adaptive local contrast (CLAHE 8×8), white-balance correction (gray-world constrained), vibrance (chroma-boost that protects skin hues), gentle S-curve.
4. **Premium denoise** — edge-preserving bilateral (separable approx.) + median pre-pass on JPEG-compressed inputs (auto-detected via DCT block variance).
5. **Compression recovery** — deblocking filter on 8×8 grid before neural pass when JPEG artifacts detected.
6. **Texture / edge recovery** — post-neural high-frequency micro-contrast in Oklab L, gated by gradient magnitude (no ringing on flats).
7. **Faster** — WebGPU compute shaders for the color/denoise/CLAHE stages (fall back to WASM SIMD), OffscreenCanvas worker, model session cached across runs.

## Architecture

```text
premium.ts (new, client-only, lazy import)
  ├─ preprocess/
  │    ├─ jpegDetect.ts        classify blockiness (DCT variance)
  │    ├─ deblock.ts           WebGPU shader + WASM fallback
  │    └─ bilateral.ts         separable bilateral denoise
  ├─ neural/                   reuse existing real-esrgan tiling
  ├─ face/
  │    ├─ detect.ts            FaceDetector → blazeface WASM fallback
  │    └─ gfpgan.ts            lazy ONNX GFPGAN v1.4 (fp16), tiled
  ├─ color/
  │    ├─ oklab.ts             sRGB↔Oklab (WebGPU + JS)
  │    ├─ clahe.ts             tiled CLAHE on L channel
  │    ├─ whitebalance.ts      gray-world with saturation clip
  │    └─ vibrance.ts          skin-hue-protected chroma boost
  ├─ finish/
  │    └─ microContrast.ts     gradient-gated Oklab-L unsharp
  └─ pipeline.ts               orchestrates stages with progress
```

- `pipeline.ts` (existing) gains a new `tier: "free" | "premium"` option.
- When `tier === "premium"` and `isPremium` entitlement is true, `enhanceImageInBrowser` dynamically imports `./premium` and routes through it; otherwise unchanged.
- All premium modules loaded via `import()` so free users pay zero bundle cost.

## Performance architecture (Task 6)

- **WebGPU compute shaders** for bilateral, CLAHE, Oklab color ops (single command encoder per stage).
- **Fallback path**: WASM SIMD (existing onnxruntime-web/wasm) + JS. Feature-detect `navigator.gpu`.
- **Web Worker + OffscreenCanvas** for all pixel work; main thread only handles progress.
- **Model caching**: `caches.open("ppp-models-v1")` persists Real-ESRGAN + GFPGAN weights across sessions; SHA-256 verified.
- **Memory**: tiles freed between stages; explicit `bitmap.close()`; single large `Float32Array` accumulator reused via `AccumulatorPool`.
- **Bundle**: premium code is a separate chunk; GFPGAN weights (~40 MB) fetched only on first premium use, with a visible "one-time download" progress step. Small quantized fp16 variant preferred; if unavailable at first ship, gate face restoration behind a "download face model" click.
- **Cross-browser**: WebGPU (Chrome/Edge stable, Safari 26 stable). Safari/Firefox without WebGPU auto-fall back to WASM SIMD — verified via feature detection, no UA sniffing.

## UX changes (minimal, no redesign)
- Progress reports new stage labels: "Analyzing…", "Reducing noise…", "Restoring faces (1/2)…", "Recovering color…", "Finishing…".
- Premium badge already shown; no new UI added in this task beyond stage labels and a one-time model-download progress line.

## Verification loop (per feature)
1. Unit tests for each pure module (oklab round-trip, deblock idempotence, CLAHE clip, bilateral edge-preservation).
2. Bench harness `scripts/bench-premium.ts` compares free vs premium on a fixture set (PSNR/SSIM against ground truth + wall time on WebGPU/WASM).
3. Playwright smoke: premium enhance completes on 1024×1024 fixture, output ≥ target dims, no network calls to inference hosts (extend existing `e2e/network.spec.ts`).
4. Regression: existing free-path tests must still pass unchanged.
5. Bundle-budget guard: main bundle unchanged; premium chunk ≤ 200 KB gz (weights excluded).

## Rollout order
1. Refactor `pipeline.ts` to accept `tier`, add lazy `premium` dispatch (no behaviour change for free).
2. Ship color stack (Oklab + CLAHE + WB + vibrance + microContrast) — pure JS first, WebGPU shader variants next.
3. Ship denoise + deblock preprocess.
4. Ship face detect + GFPGAN (behind first-use download consent).
5. Add bench + Playwright coverage; wire progress labels.

## Out of scope
- Any redesign of `index.tsx` UI beyond stage labels.
- Any change to Stripe/entitlement/free-cap logic.
- Any hosted/cloud enhancement path.
