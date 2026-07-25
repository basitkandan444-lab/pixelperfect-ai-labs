# Premium Intelligence Engine — Tasks 5 + 6 Completion Plan

## Objectives
Turn the premium path from a fixed post-pass into an **image-adaptive** engine that:
1. Analyzes each input image.
2. Dynamically selects which premium capabilities/models/optimizations to run.
3. Caches models across sessions.
4. Continuously verifies itself via benchmarks and regression harness.

All existing invariants preserved: 100% on-device, no hosted inference, no credits, free path untouched, bundle budgets held, lazy-loaded premium chunk, SSR-safe.

## Architecture

```text
src/lib/enhance/premium/
  intelligence/
    analyzer.ts        image feature extraction (pure JS, ~10ms on 512² thumbnail)
    selector.ts        capability + model selection policy (pure, deterministic)
    plan.ts            types: ImageProfile, PremiumPlan, Capability
    analyzer.test.ts
    selector.test.ts
  optimize/
    scheduler.ts       stage runner: budget-aware, cancellable, progress-weighted
    memory.ts          AccumulatorPool + bitmap lifecycle helpers
    backend.ts         WebGPU feature-detect → WASM SIMD → JS fallback
  models/
    registry.ts        model manifest (id, url, sha256, size, purpose)
    cache.ts           CacheStorage("ppp-models-v1") + SHA-256 verify + LRU evict
    loader.ts          lazy ORT session factory, shared across runs
    registry.test.ts
    cache.test.ts
  bench/
    harness.ts         PSNR / SSIM / ΔE00 / wall-time over fixture set
    fixtures/          tiny PNGs committed under 200KB total
    harness.test.ts
  pipeline.ts          orchestrator: analyze → plan → execute → verify
```

`enhanceImageInBrowser` still calls `import("./premium/pipeline")` — no change to public API or free path.

## Data flow

```text
RGBA (post-upscale)
   │
   ▼
analyzer.ts ─► ImageProfile { faces?, jpegBlockiness, noiseSigma,
                              lowlightRatio, colorCastLab, sharpnessVar,
                              gamutClipPct, chromaMean, edgeDensity, dims }
   │
   ▼
selector.ts ─► PremiumPlan {
     stages: ["deblock"?, "bilateral"?, "clahe"?, "wb"?, "vibrance"?,
              "microContrast"?, "sCurve"?, "faceRestore"?],
     params:   per-stage tuned from profile,
     backend:  "webgpu" | "wasm" | "js",
     modelIds: string[]      (only what's needed)
   }
   │
   ▼
scheduler.ts ─► executes stages, streams progress, honors AbortSignal,
                pulls models via models/loader → cache
   │
   ▼
bench/harness.ts (dev + CI only) validates output vs fixtures
```

## Selection policy (deterministic, testable)

| Profile signal | Threshold | Enables |
|---|---|---|
| jpegBlockiness ≥ 0.35 | high | deblock + stronger bilateral |
| noiseSigma ≥ 6 | high | bilateral (sigmaRange scaled) |
| lowlightRatio ≥ 0.30 | dark image | CLAHE clip 2.6, S-curve +0.05 |
| |colorCastLab| ≥ 3 ΔE | cast | grayWorldWhiteBalance strength up |
| chromaMean ≤ 0.03 | flat color | vibrance up to 0.24 |
| edgeDensity ≥ 0.12 | detailed | microContrast on, gated |
| edgeDensity < 0.04 | flat | microContrast off (avoid noise amp) |
| faces detected ≥ 1 | portrait | queue face model (only if premium + cached or user-consented download) |
| dims ≥ 12 MP AND memoryGB ≤ 4 | tight | force backend "wasm", disable face restore |

Policy is a pure function `(profile, caps) → plan`; 100% unit-testable, no side effects.

## Model management

- `registry.ts` lists models (`realesrgan-x4v3` already asset-hosted; face model **not shipped by default** — only fetched on first premium use with visible progress + user gesture, per existing memory constraint).
- `cache.ts` uses `caches.open("ppp-models-v1")`, verifies SHA-256, evicts oldest when >150MB.
- `loader.ts` memoizes ORT `InferenceSession` per model id for the tab lifetime.
- No new hard dependencies; no hosted inference.

## Optimization layer

- `backend.ts`: `navigator.gpu` probe → WebGPU; else `crossOriginIsolated && SIMD` → WASM SIMD; else JS. Result cached per session.
- `scheduler.ts`: stage weights sum to 1.0 for smooth progress; each stage checks `signal.aborted` and yields via `await new Promise(r => setTimeout(r))` between tiles.
- `memory.ts`: `AccumulatorPool` reuses `Float32Array` buffers across stages; explicit `bitmap.close()`.

## Benchmarking / verification

- `bench/harness.ts` compares premium output vs stored reference for 4 fixtures (portrait, JPEG-crushed, low-light, high-detail):
  - PSNR ≥ baseline
  - SSIM ≥ 0.90 vs reference
  - Wall-time budget per backend
- Runs under Vitest (fast subset) + optional full run via `scripts/bench-premium.ts`.
- Playwright `e2e/network.spec.ts` extended to assert zero fetches to non-first-party inference hosts during premium enhance.

## Files to be modified/created

**New**: everything under `src/lib/enhance/premium/{intelligence,optimize,models,bench}/*` + tests.
**Modified**: `src/lib/enhance/premium/pipeline.ts` (delegates to intelligence + scheduler; keeps signature).
**Untouched**: `pipeline.ts` (top-level), `neural.ts`, `enhance.worker.ts`, all free path, entitlement, Stripe, UI routes.

## Trade-offs

- Adds ~15–25 KB gz to the **premium** chunk (still ≤200 KB gz budget).
- Analyzer runs on a 512² downsample → <10 ms even on low-end mobile.
- Deterministic selector avoids "AI picking AI" opacity: every decision is inspectable and testable.
- Face restoration remains gated behind explicit first-use download to honor the "no surprise 40 MB fetch" rule.

## Performance implications

- Free path: **zero** change in bundle, runtime, or behavior.
- Premium path: same or faster than current fixed post-pass for most images (skips unneeded stages); slower only when profile genuinely warrants more work.
- Progress reporting becomes more accurate (weighted by planned stages).

## Verification loops (per feature)

1. Unit tests for analyzer signals (synthetic inputs with known properties).
2. Unit tests for selector policy (table-driven).
3. Round-trip tests on pipeline (profile → plan → execute → shape assertions).
4. Bench harness: PSNR/SSIM vs reference fixtures.
5. Playwright: premium enhance completes; zero external inference calls.
6. Bundle-size guard: `scripts/check-bundle-size.mjs` gate.
7. SSR guard: `import.meta.env.SSR` short-circuits in every new client-only entry.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Analyzer misclassifies → wrong plan | Deterministic thresholds + unit tests; plan is logged to `console.debug` in dev only |
| Model cache corruption | SHA-256 verify on read; auto-evict + refetch on mismatch |
| WebGPU flakiness on Safari | Automatic fallback to WASM; feature-detected, no UA sniffing |
| Bundle growth | Per-subfolder dynamic imports; bundle-size CI check |
| Face model download surprise | Gated behind explicit user gesture; visible progress; skippable |

## Rollout order

1. `intelligence/plan.ts` + `analyzer.ts` + tests.
2. `intelligence/selector.ts` + tests.
3. `optimize/{backend,memory,scheduler}.ts` + tests.
4. `models/{registry,cache,loader}.ts` + tests.
5. Refactor `premium/pipeline.ts` to delegate (keeps existing stages as capabilities).
6. `bench/harness.ts` + fixtures + tests.
7. Extend `e2e/network.spec.ts`; run full verification loop.
8. Report: bundle deltas, bench numbers, coverage, invariant checks.

## Out of scope

- Any change to free path, Stripe, entitlement, routes, UI.
- Any hosted/cloud inference.
- Any change to `pipeline.ts` public API.
- New models beyond the already-shipped Real-ESRGAN unless explicitly approved.

---

Reply **APPROVE**, **SKIP**, or **REQUEST CHANGES**. I will not begin implementation until approval.
