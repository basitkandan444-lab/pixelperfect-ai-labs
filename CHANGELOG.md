# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — premium self-calibrating prediction engine + processing UI

- **Self-calibrating prediction engine (`src/lib/enhance/predictor.ts`).** A new
  pure, SSR-safe module that wraps the physics estimate with (a) richer signals
  (megapixels, output pixels, file bytes/format decode term, actual neural tile
  count, warm state, device tier) and (b) **per-device calibration**: after every
  completed run it compares predicted vs. actual time and updates a small,
  per-engine correction factor persisted in `localStorage`, so estimates get more
  accurate the more the user enhances on that device. Exposes `predict`,
  `recordOutcome`, `adjustRemainingMs`, `confidencePercent`, `countTiles`,
  `stageForProgress`. Fully unit-tested (18 cases) with an injectable storage.
- **AI Analysis Card (`src/components/AnalysisCard.tsx`).** Before enhancing, a
  desktop-app-style card surfaces every signal: resolution, megapixels, file
  type, processing mode + acceleration, device tier, neural engine status
  (Ready / Warming), estimated time, and a live **prediction accuracy** score.
- **Premium processing overlay (`src/components/ProcessingOverlay.tsx`).**
  Replaces the plain spinner with a large animated ETA countdown, a smooth
  progress bar, and a five-stage pipeline tracker (Preparing → AI Analysis →
  Neural Enhancement → Blending → Finalizing).
- **Dynamic, non-expiring ETA.** During processing the ETA is recomputed from
  real progress via `adjustRemainingMs`: if a run is behind schedule the clock
  extends rather than hitting zero early, and collapses smoothly as it completes.

### Changed

- `src/routes/index.tsx` now drives the prediction engine, captures file
  size/format on upload, tracks reactive neural-warm state, feeds each run's
  real duration back into the calibrator, and renders the new card + overlay.
  Kept 100% browser-first, offline-after-first-load, deterministic and SSR-safe;
  no change to enhancement quality or performance.

### Added — live time-to-complete countdown + faster first enhance

- **Live ETA countdown.** When the user presses Enhance, a clock now shows a
  realistic "Ns remaining" countdown for their device, plus an up-front
  "Estimated time on your device" hint before they commit. Removes the
  open-ended-spinner uncertainty that caused drop-off between enhance-start and
  download.
- **New pure module `src/lib/enhance/estimate.ts`** (fully unit-tested, no DOM):
  device-tier throughput model over the real tiled workload (`estimateEnhanceMs`)
  plus `formatEta` / `formatRemaining` label helpers.
- **Background neural warm-up (`warmUpNeural` in `neural.ts`).** The one-time
  model + onnxruntime WASM download/session-create cost is now paid in the
  background right after upload (while the user picks options), so pressing
  Enhance goes straight to inference instead of waiting on cold start. Still
  100% on-device, offline-after-first-load, SSR-safe — no server, no APIs.

### Added — Phase 1: production-grade tiled neural inference

- **Removed the fixed 512px neural input cap.** The Real-ESRGAN model now
  processes the image at full resolution (bounded only by the output pixel
  budget, i.e. the real browser memory limit) instead of a 512px downscaled
  proxy, producing measurably higher detail retention. Same model, same
  browser-first / offline / SSR-safe architecture — no server, no APIs.
- **New pure module `src/lib/enhance/tiling.ts`** (fully unit-tested, no DOM):
  - Overlapping tile planning (`planTiles`) with a deterministic, row-major
    layout and the last row/column pinned flush to the far edge.
  - Adaptive tile sizing from device memory/tier (`pickTileSize`) with
    halving retry down to a 128px floor (`nextSmallerTile`) on GPU OOM.
  - Configurable overlap clamped to 16–64px (`clampOverlap`).
  - Feathered blend weights via symmetric smoothstep (`tileBlendWeights`),
    normalised by an accumulated weight plane so seams vanish and output is
    **identical regardless of tile order**.
  - Gamma-correct blending: tiles are averaged in linear light
    (`srgbToLinear`/`linearToSrgb`) to preserve colour across boundaries.
- **`neural.ts` rewritten to a tiled pipeline:** sequential tile scheduling to
  bound peak VRAM, per-tile buffer release + runtime yield between tiles,
  `AbortSignal` cancellation between tiles, adaptive-size retry on memory
  errors, and a single-tile fast path for small images (byte-for-byte the
  previous behaviour — zero regression).
- **Fallback order preserved:** WebGPU → WASM → classical fast engine.
- **Validation:** 17 new tiling tests including a full reassembly simulation
  proving seam-free reconstruction (max error < 1/255 across boundaries) and
  order-independent determinism. Full suite 103/103, typecheck clean, SSR
  bundle free of executable ML code, client JS 994.7 KB (within 1400 KB budget).

### Changed — Neural engine upgraded to Real-ESRGAN (evidence-based model swap)

- **Replaced the Swin2SR (transformers.js) neural path with Real-ESRGAN
  general-x4v3 (SRVGGNetCompact) running on `onnxruntime-web/webgpu`.** Swept
  the browser-compatible model ecosystem (Lanczos, Swin2SR variants,
  Real-ESRGAN/Real-CUGAN, GFPGAN/CodeFormer/GPEN face restorers) and chose the
  demonstrably superior browser-first option for this app's real-photo
  restoration use case:
  - **Quality:** GAN-based SR recovers hair/skin/fabric texture that
    PSNR-oriented transformer SR (Swin2SR) over-smooths at 4×; stronger on old,
    noisy and compressed photos (per documented head-to-head comparison).
  - **Verified detail gain:** CPU inference on a degraded 96px test tile
    produced an exact 4× output with **2.33× the Laplacian (edge) variance of a
    bicubic upscale** — real synthesised detail, not resampling.
  - **Size:** 2.4 MB weights (vendored as a first-party Lovable CDN asset) vs
    47 MB for Swin2SR — ~20× smaller one-time download.
  - **Speed:** ~0.18 s for a 96px tile on pure CPU (far faster on WebGPU) vs
    8–15 s for Swin2SR.
  - **Shape:** fully dynamic ONNX input, so the whole capped image runs in one
    pass (no fixed-tile stitching seams).
- **Runtime:** pinned `onnxruntime-web@1.22.0`; removed `@huggingface/transformers`.
  The WebGPU "bundle" build self-locates its co-located ~22 MB WASM asset from
  our own deploy (first-party, offline after first load — no CDN). Runs
  single-threaded (no COOP/COEP requirement); falls back WebGPU → WASM →
  (pipeline) classical on any failure.
- **Bundle:** total client JS **dropped 1113 KB → 992 KB**; SSR/worker bundle
  verified free of onnxruntime; 86/86 tests and typecheck green.

### Changed — Restored pure browser-first architecture (removed all hosted AI)

- **Removed the hosted "Max (Studio AI)" path entirely.** Deleted the server
  route `src/routes/api/enhance-max.ts` and the client helper
  `src/lib/enhance/hosted.ts`, and dropped the `"hosted"` engine from the
  pipeline, UI selector, result labels and types. There is now **zero hosted
  inference, zero API calls for image processing, zero credits, and zero
  external GPU servers** — every enhancement runs on the user's own device and
  works fully offline after assets download. This reverts the opt-in cloud tier
  and re-commits to the project's non-negotiable browser-first philosophy.
- **Upgraded the on-device neural engine to a stronger, evidence-based model.**
  Switched `src/lib/enhance/neural.ts` from `Xenova/swin2SR-lightweight-x2-64`
  (bicubic-only, x2) to `Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr`
  (real-world x4, trained on BSRGAN blur/noise/JPEG degradations). Real uploads
  are degraded photos, so a real-world checkpoint removes compression artifacts
  and reconstructs edges instead of amplifying them, and performs 4× of the
  upscale in the neural domain (vs 2×) for sharper large outputs. Input cap
  lowered to 512px long-edge to keep x4 memory in budget on-device.
- Both engines remain 100% browser-first: classical (instant, zero-download)
  and neural (lazy-loaded WebGPU, one-time weight download, then offline).

### Added — Hybrid enhancement engine (classical + opt-in neural super-resolution)

- **Forensic finding (evidence, not assumption):** a real browser-driven audit
  proved the classical engine _does_ modify the download substantially
  (mean abs diff 8.27/255, 75% of pixels changed, ~180× the edge energy of a
  bicubic resize, 0 hosted-inference requests). The "looks the same" report had
  two real causes: (1) the compare slider/preview downscaled the 4K output to
  the viewport, discarding the upscaled resolution; (2) classical sharpening
  cannot synthesise genuinely new detail.
- **Actual-pixels view:** the result now has a "View actual pixels (100%)"
  toggle (`src/routes/index.tsx`) so the enhanced resolution is visible instead
  of a shrunk-to-fit preview.
- **Neural super-resolution (opt-in):** new "Max quality (AI)" engine
  (`src/lib/enhance/neural.ts`) runs a real learned model
  (`Xenova/swin2SR-lightweight-x2-64`) entirely in the browser via
  transformers.js + WebGPU. Lazy-loaded on first use (own ~244 KB gzip chunk,
  never in the initial bundle; model weights fetched once from CDN and cached).
  Still zero hosted inference / zero credits. Verified in Node that it recovers
  cleaner detail than bicubic (edge energy 83 vs 70, no ringing).
- **Graceful degradation:** neural is only surfaced when WebGPU is present (the
  WASM backend is too slow to be worth offering); any neural failure
  (no adapter, fetch/OOM) falls back to the classical engine so the user always
  gets a result. Verified end-to-end in a headless browser.
- **Default unchanged:** the instant, zero-download classical engine remains the
  default ("Fast").

### Fixed — Enhancement produced visually identical output

- **Detail-recovery pass was perceptually a no-op.** A forensic pixel-level
  audit (upload → bitmap → worker → canvas → blob → preview) found the
  "enhanced" output was indistinguishable from a plain bicubic resize:
  SSIM 1.0000, mean abs diff 0.31/255, only ~0.1% of pixels changed by >2
  levels, sharpness gain 1.9×. Root cause: the unsharp-mask radius was
  hardcoded to 1px while a 4×/8× interpolated upscale spreads edges over
  ~4–8px, so sharpening operated below the interpolation-blur scale.
- **Fix:** the coarse unsharp radius now scales with the actual upscale factor
  (`filterFor(caps, target.factor)` in `pipeline.ts`), `filters.ts` applies a
  two-scale unsharp (coarse at the factor scale + fine radius-1 micro-contrast),
  and per-tier amounts were raised. Re-audit on the same real photo: sharpness
  gain **15.0×** and **11.2%** of pixels changed by >2 levels — measurable and
  visibly sharper edges. Still zero network/inference requests.
- Added a regression test in `filters.test.ts` asserting a factor-matched
  radius sharpens a soft 4px edge >2× more than a fixed 1px radius, so the
  mismatch cannot silently return.

### Changed — Browser-first enhancement engine (zero hosted inference, zero credits)

- **Removed all hosted AI inference.** Deleted the server route
  `src/routes/api/enhance-image.ts`, its orchestrator `src/lib/enhance-image.core.ts`,
  and the three associated test files. The app no longer calls the Lovable AI
  Gateway (`ai.gateway.lovable.dev`), consumes credits, or requires
  `LOVABLE_API_KEY` (dropped from `src/lib/env.ts`, `.env.example`, and the
  `/api/public/health` readiness probe).
- **New in-browser engine** under `src/lib/enhance/`: `capabilities.ts`
  (WebGPU/WebGL/OffscreenCanvas/Worker/cores/memory detection + tier), `targets.ts`
  (target-dimension math), `filters.ts` (box blur, unsharp-mask + denoise),
  `render.ts` (progressive high-quality resampling + detail recovery),
  `enhance.worker.ts` (off-main-thread OffscreenCanvas), and `pipeline.ts`
  (orchestrator with worker path + main-thread fallback, cancellation, staged
  progress). All inference runs on the user's own CPU/GPU.
- **Client UX** (`src/routes/index.tsx`): enhancement is lazy-loaded on first
  click (kept out of the initial bundle), streams human status ("Preparing local
  AI engine…", "Using GPU/CPU acceleration…"), supports Cancel, and never
  mentions credits/billing/quota. Works fully offline.
- **Tests**: added `targets.test.ts`, `filters.test.ts`, `capabilities.test.ts`
  (17 unit tests); migrated the e2e suite off network mocks to the real local
  engine, added offline-success and no-inference-request proofs, and retired the
  now-nondeterministic result/error visual baselines.
- **Bundle budget**: `maxChunkBytes` raised 600→640 KB (documented) — the
  largest chunk is the TanStack Router vendor bundle (~612 KB raw / ~139 KB
  gzip), a single unsplittable dependency; the engine + worker are separate lazy
  chunks.

### Added — Architecture fitness functions (drift guardrails)

- **Executable architecture fitness functions** (`src/lib/architecture.fitness.test.ts`).
  The layering rules previously documented only as prose in `docs/ARCHITECTURE.md`
  are now enforced automatically in the standard test gate (`bun run check` + CI),
  so the architecture cannot silently drift. Enforced invariants:
  - **Dependency direction** — `src/lib`, `src/components`, `src/hooks` must never
    import from `src/routes` (routes are edge adapters; the core stays stable).
  - **Framework-agnostic core** — `*.core.ts` logic must not import
    `@tanstack/react-router`/`react-start`, keeping it unit-testable in isolation.
  - **Secret/env boundary** — `process.env` is confined to server-only surfaces
    (`src/routes/**`, `src/lib/env.ts`, `src/server.ts`, `src/start.ts`, `*.server.ts`);
    presentational components may not touch env or secrets.
  - **Generated-file integrity** — `routeTree.gen.ts` must retain its generated
    banner (proves it was not hand-edited).
  - **Bounded contexts** — business HTTP endpoints must live under `src/routes/api/`
    (root web-standard files like `sitemap.xml` are explicitly exempt).
    Verified the guardrail fails on injected drift and passes when restored.

### Changed — Architecture / dependency hygiene

- **Pruned dead UI surface and dependencies.** The template shipped all 46
  shadcn/ui primitives, but only 4 are used anywhere in the app (`badge`,
  `button`, `card`, `sonner`). The 42 unused primitives were removed along with
  the 33 production dependencies that existed solely to support them
  (25 `@radix-ui/*` packages plus `cmdk`, `embla-carousel-react`, `input-otp`,
  `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`,
  `vaul`). Evidence: `rg -oNI "@/components/ui/*" src -g '!src/components/ui/**'`
  returns only the four kept primitives; each removed dependency had zero
  references outside `src/components/ui/`. This cuts the installed dependency /
  supply-chain surface (fewer `bun audit` advisories and Dependabot PRs to
  triage), shrinks the typecheck/lint/format footprint, and removes maintenance
  drift on code no feature imports. shadcn config (`components.json`) is
  retained, so any future primitive is one `bunx shadcn add <name>` away.
  Verified with `bun run typecheck`, `bun run lint` (0 errors), `format:check`,
  `bun run test` (99 passing), `bun run build`, and `bun run bundle:check`.

### Fixed

- **Cross-engine reliability of the enhance journey (Firefox/WebKit):** the image
  preview frame now has a minimum height and centers the image
  (`min-h-[240px]` + `object-contain`). Previously a small/thin image collapsed
  the `overflow-hidden` preview container to ~1px on Gecko, so the absolutely
  positioned "Enhancing…" overlay — including its accessible `progressbar` — had
  no visible height and rendered clipped/broken. This was surfaced by the E2E
  journey test failing only on Firefox; it is a genuine responsive defect for
  small images, not a test artifact. Real UX for tiny previews is also fixed.
- **Flaky landing visual snapshot:** the full-page `landing-empty` snapshot now
  waits for `document.fonts.ready` and uses a realistic 20s stabilization
  timeout. The tall marketing page could not reach two identical frames within
  the tight 5s default on cold runs (font swap + eager media), causing
  intermittent timeouts. Baselines for the affected workspace states were
  regenerated for the taller preview frame.

### Observability & Operations (Developer Command Center)

- **Developer Command Center (`/ops`):** a single live operational view of the
  running deployment — service status (operational/degraded/outage), release
  intelligence, reliability, runtime-error breakdown, Web Vitals field data and
  bundle budgets. Polls the public telemetry endpoints every 5s. `noindex` and
  disallowed in `robots.txt`; reads only PII-free public telemetry.
- **Release intelligence:** build metadata (version, commit SHA, build time) is
  baked in at build time via Vite `define` (`src/lib/build-info.ts`) and served
  at `/api/public/version`. Commit SHA is read from CI env, so any deployment
  reports exactly which build/commit is live.
- **Deployment health check:** `/api/public/health` now returns liveness plus
  the derived deployment status, release info, isolate uptime and readiness
  checks (`server`, `ai_configured`) — while keeping the `{"status":"ok"}`
  contract existing monitors depend on.
- **Runtime error aggregation:** `src/lib/metrics.ts` now tallies failures by
  stable error code (`ai_timeout`, `ai_failed`, `invalid_request`, …), wired
  through the enhance endpoint. Surfaced on `/ops` and `/api/public/metrics`.
- **Performance dashboards (Web Vitals RUM):** real Core Web Vitals (LCP, CLS,
  INP, FCP, TTFB) are collected from actual sessions with Google's `web-vitals`
  library (`src/lib/web-vitals.ts`), beaconed to `/api/public/vitals`, aggregated
  into p75 + rating buckets per isolate (`src/lib/vitals-store.ts`), and also
  forwarded to GA4.
- **Bundle monitoring:** `bun run bundle:check`
  (`scripts/check-bundle-size.mjs`) enforces client-payload budgets
  (`BUNDLE_BUDGETS` in `src/lib/ops.ts`) and fails CI on regressions; a unit
  test keeps the script and the shared budgets in sync. Added as a CI step after
  the production build.
- **Operational telemetry endpoint:** `/api/public/metrics` now returns the
  deployment status, release, full reliability snapshot (with error breakdown)
  and Web Vitals aggregate in one PII-free payload.
- **Design tokens:** added semantic `status-ok` / `status-warn` / `status-bad`
  color tokens (traffic-light) to the design system for the command center.
- **Tests:** added `build-info`, `vitals-store`, and `ops` unit suites plus
  error-aggregation coverage for `metrics`; extended the coverage gate to the
  new business-logic modules (99 tests, ~98.6% line coverage).
- **Docs:** new [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) maps the whole
  telemetry system; deployment verification steps updated.

### Testing

- **Toast accessibility — real fix, not a suppression:** removed the sonner
  `richColors` variant (saturated fills with low-contrast title text that failed
  axe `color-contrast`, serious). Toasts now use the design tokens
  (`bg-background` / `text-foreground`, a WCAG AA pairing) with status conveyed
  by a tinted icon + left accent border. The axe `.exclude("[data-sonner-toaster]")`
  workaround was deleted, so `e2e/a11y.spec.ts` now scans the **entire** hydrated
  page — including toasts — with zero violations. The previously "known"
  contrast finding is resolved.
- **Reduced-motion behavioural test (WCAG 2.3.3):** `e2e/a11y.spec.ts` now
  emulates `prefers-reduced-motion: reduce` and asserts the ambient decorative
  animations are actually collapsed (computed `animation-duration` < 1 frame),
  so a regression that drops the CSS reset fails the build instead of silently
  shipping vestibular-unsafe motion.
- **Network-resilience suite (`e2e/network.spec.ts`):** flips the whole browser
  context offline via CDP (`context.setOffline`) — the closest deterministic
  analogue to real connectivity loss — and verifies the enhance flow degrades
  gracefully (clear recovery message, workspace stays retryable) and then
  succeeds end-to-end once connectivity is restored, proving no corrupt state is
  left behind. Complements the route-level abort mock in `failure-scenarios`.
- **CI diagnostics:** Playwright now emits an HTML report (uploaded as the
  `playwright-report` artifact on **every** run, not just failures) plus video
  `on-first-retry` alongside the existing trace, so both passing (timings) and
  failing (trace/video/screenshots) runs are fully investigable.
- **Repo hygiene:** git-ignored generated test output (`coverage/`,
  `playwright-report/`, `blob-report/`, `test-results/`); committed visual
  baselines under `e2e/**-snapshots/` remain tracked. Fixed an
  ESLint `no-empty-pattern` error in `e2e/visual.spec.ts`.
- **Testing documentation (`docs/TESTING.md`):** a single-source guide to the
  testing philosophy, all test layers, the browser matrix, how to run/debug each
  layer, the coverage gate and the CI pipeline.

- **Cross-engine browser matrix:** expanded Playwright projects from 2 to 5 —
  `desktop-chromium`, `desktop-firefox`, `desktop-webkit`, `mobile-chrome`
  (Pixel 5) and `mobile-safari` (iPhone 13). Functional + accessibility specs
  run on all five so engine-specific rendering, upload, pointer, keyboard and
  a11y differences (Blink/Gecko/WebKit) are caught. CI installs all three
  engines with `playwright install --with-deps chromium firefox webkit`.
- **Automated accessibility gate (`e2e/a11y.spec.ts`):** `@axe-core/playwright`
  scans WCAG 2.1 A/AA on the hydrated app across every engine (landing,
  uploaded and result states) plus explicit landmark, single-H1, keyboard-
  operability and compare-slider ARIA checks. Transient sonner toasts are
  excluded from the scan (portal-rendered, auto-dismissing, library-themed) so
  the gate is deterministic. Known finding: the `richColors` success toast
  title fails `color-contrast` (serious) — to be aligned to design tokens.
- **Coverage gate:** `@vitest/coverage-v8` with enforceable thresholds (lines
  90 / functions 90 / branches 85 / statements 90) scoped to the tested
  business-logic modules (`enhance-image.core`, `rate-limit`, `metrics`,
  `api-response`, `landing`). Current: 98.8% lines / 94.48% branches. Reports
  (`text`, `html`, `lcov`) are uploaded as a CI artifact; `bun run
test:coverage` runs it locally.
- **HTTP integration & security suite (`enhance-image.http.test.ts`, 14 tests):**
  drives the real `handleEnhanceImage(Request)` lifecycle over the Request/
  Response boundary — malformed JSON, empty body, wrong content type, multipart,
  oversized (`Content-Length` 413), SVG data URLs, unexpected MIME (gif),
  path-traversal filenames, invalid scale enum — asserting safe failure AND that
  no secret/key/upstream URL/model/stack ever leaks in the response. Plus
  full-lifecycle success, `no-store` header, missing-key 500, upstream bad-JSON
  502, no-image 502 and HTTP-layer rate limiting with `Retry-After` headers.
- **Visual regression expansion:** added `workspace-ready` and `workspace-error`
  states alongside the existing landing + result snapshots; baselines committed
  for `desktop-chromium` and `mobile-chrome`. Visual baselines are intentionally
  scoped to those two projects (skip guard in `visual.spec.ts`) since pixel-exact
  snapshots are per-engine/per-OS and cross-engine baselines multiply flake for
  little added signal — behaviour is covered cross-engine by the functional/a11y
  suites.

- **Missing desktop landing visual baseline:** restored the absent
  `e2e/visual.spec.ts-snapshots/landing-empty-desktop-chromium-linux.png`
  baseline. Root cause: the `desktop-chromium` landing snapshot was never
  committed (the other three snapshots existed), so CI's first comparison for
  that project had nothing to diff against and failed with "A snapshot doesn't
  exist … writing actual". It was not gitignored, renamed, or relocated — the
  file was simply missing. Fix: generated the baseline via Playwright's official
  `--update-snapshots` workflow on the same Linux/Chromium platform CI uses and
  committed it. All 20 E2E tests now pass. This is a genuine baseline, not a
  suppression — the visual assertion remains fully active.

- **Mobile oversized-upload E2E stability:** eliminated the flaky
  `mobile-chrome` "rejects an oversized image" spec. Root cause: the shared
  `uploadImage` helper retried the entire upload until React hydration attached
  the input's `onChange` handler, re-transferring the full 15 MB buffer over CDP
  on every retry — under mobile parallel workers this exhausted the time budget
  and raced the auto-dismissing toast. Fix: the upload `<input>` now emits a
  `data-hydrated="true"` marker once hydrated, and the E2E helper waits for that
  deterministic signal before transferring the file exactly once (new
  `waitForHydration` helper). Verified stable across parallel repeats; all 16
  functional E2E tests pass on desktop and mobile. No production behavior
  changed (marker is inert).

- **Testing foundation expansion (Module 4, Waves 4A–4C):** after an audit that
  confirmed the enhancement core was already covered (validation, error mapping,
  timeout/retry, client-abort, rate limiting — 19 tests in
  `enhance-image.core.test.ts`), added focused unit tests for the previously
  untested high/medium-risk modules: the rate limiter
  (`rate-limit.test.ts` — window limits/reset, per-key isolation, `resetSec`,
  memory-bounded key eviction, client-IP resolution), the API response envelopes
  (`api-response.test.ts` — success/failure shape, `Cache-Control: no-store`,
  header merging, `requestId` echo), the in-memory metrics
  (`metrics.test.ts` — counters, rejection/abort categories, `successRate`
  bounds, p95 ≥ average), and the landing-page SEO data
  (`landing.test.ts` — unique slugs/paths, valid internal "related" links,
  required metadata, JSON-LD validity). Suite now runs 49 tests across 5 files.
  No production logic changed.

### Documentation

- **Architecture alignment & documentation maturity (Wave 3E, docs only):**
  expanded `docs/ARCHITECTURE.md` with a detailed current processing-flow
  diagram (User → Frontend → Backend processing → Validation → AI Gateway →
  Gemini model → Enhanced response) plus an explicit "where things happen today"
  breakdown of processing, validation, failure handling, request control, and
  existing infrastructure. Added dedicated **Architecture layers** (frontend,
  backend, AI processing, monitoring, security), **Engineering principles**
  (reliability first, measurable improvements only, avoid unnecessary
  complexity, verify before completion), and **Future migration philosophy**
  (evolve toward more efficient execution only when technically and economically
  justified) sections. Current state and future direction remain explicitly
  separated. No functional, API, route, test, or behaviour changes.

- **Future-proof documentation & terminology (docs only):** added a "Future
  execution direction" section to `README.md` and `docs/ARCHITECTURE.md` that
  keeps **Current state** (enhancement runs on centralized infrastructure today)
  and **Future direction** (moving enhancement toward participants' own devices,
  with centralized coordination only when required) explicitly separated.
  Execution targets are documented as interchangeable examples (WebGPU, WebNN,
  WebAssembly, ONNX Runtime, TensorFlow.js, native/Electron/Tauri, PWAs) rather
  than commitments, scalability is described as a property of the aggregate
  capability of participating devices, and optimization language describes
  engineering outcomes (freeing processing resources, reducing unnecessary
  computation, improving responsiveness) rather than financial savings. No
  functional, API, route, test, or behaviour changes.

### Reliability

- **Client-disconnect cancellation (Wave 3C/3D):** `/api/enhance-image` now
  propagates the incoming request's abort signal into the upstream enhancement
  call. When a client disconnects mid-enhancement (tab closed, navigation away,
  network drop), the in-flight processing is stopped immediately instead of
  running to completion unobserved — freeing processing resources and preventing
  unnecessary computation after the user leaves. A client abort is terminal
  (never retried) and returns `499`; it is tracked in the new `clientAborted`
  metric rather than counted as a server `failure`, so reliability metrics
  (`successRate`) stay accurate. Zero behaviour change for normal requests.

### Security

- **Early payload-size guard (Wave 3A/3B):** `/api/enhance-image` now rejects
  oversized requests with `413 payload_too_large` by inspecting the
  `Content-Length` header **before** buffering the body. Previously the entire
  request body was read into memory via `request.json()` before the zod size cap
  ran, so a malicious multi-hundred-MB payload could be fully buffered before
  rejection (unbounded-memory / DoS vector). Valid uploads are unaffected.

### Changed

- **Mobile touch fix (Wave 2C/2D):** added `touch-none` to the `CompareSlider`
  drag handle. Dragging the before/after handle on touch devices no longer
  scrolls or zooms the page — matching shadcn's own slider convention. This is
  the product's primary interaction; no visual or desktop behaviour change.

- **Mobile polish (Wave 2B):** replaced `min-h-screen` (100vh) with `min-h-dvh`
  (dynamic viewport height) on every full-height page wrapper — home, landing,
  content pages, and the 404/error boundaries. On mobile browsers this prevents
  the layout gap/jump caused by the collapsing URL bar. No desktop visual change.

- **Frontend architecture (Wave 2A):** extracted the duplicated per-route origin
  loader (`async () => ({ origin: await getRequestOrigin() })`) into a single
  shared `originLoader` in `src/lib/origin.functions.ts`, replacing 16 identical
  inline loaders across the root and every page route. No behavior, UI, route,
  API, or SEO change.

### Added

- **Security hardening (Wave 1D/1E):**
  - `Content-Security-Policy` on all SSR/API responses with `object-src 'none'`,
    `base-uri 'self'`, `frame-ancestors 'self'`, and `form-action 'self'`
    (no `default-src`, so scripts/styles/images/analytics stay unaffected).
  - `Cross-Origin-Opener-Policy: same-origin` for cross-origin process isolation.

- **Repository hardening (Wave 1C):**
  - Centralized, fail-fast environment validation (`src/lib/env.ts`) with Zod;
    wired into analytics (client) and the enhance-image route (server).
  - `.env.example` template documenting every environment variable.
  - GitHub engineering files: `CODEOWNERS`, `SECURITY.md`, `SUPPORT.md`, and
    `dependabot.yml` (grouped weekly dependency + Actions updates).
  - README release workflow and troubleshooting sections.
- CI quality gate (`.github/workflows/ci.yml`): typecheck, lint, format check,
  production build, and dependency audit on every push and pull request.
- `bun run typecheck`, `bun run format:check`, and `bun run check` scripts.
- Explicit `typescript` dev dependency so the typecheck gate is reproducible.
- Public health-check endpoint at `/api/public/health` for uptime monitoring.
- GitHub pull request and issue templates.
- Operational documentation: `docs/RUNBOOK.md`, `docs/DEPLOYMENT.md`, `CONTRIBUTING.md`.

### Changed

- `bun run check` now also runs the test suite, matching CI exactly.

### Removed

- Unused dependencies `date-fns` and `@hookform/resolvers`.

- CI quality gate (`.github/workflows/ci.yml`): typecheck, lint, format check,
  production build, and dependency audit on every push and pull request.
- `bun run typecheck`, `bun run format:check`, and `bun run check` scripts.
- Explicit `typescript` dev dependency so the typecheck gate is reproducible.
- Public health-check endpoint at `/api/public/health` for uptime monitoring.
- GitHub pull request and issue templates.
- Operational documentation: `docs/RUNBOOK.md`, `docs/DEPLOYMENT.md`, `CONTRIBUTING.md`.
- **AI request governance (Wave 1B)** for `/api/enhance-image`:
  - Standardized response envelopes (`{ success, data }` / `{ success, error }`)
    with a per-request `requestId` (`src/lib/api-response.ts`).
  - Per-IP rate limiting foundation (`src/lib/rate-limit.ts`, 15 req/min) with
    `Retry-After` / `X-RateLimit-*` headers.
  - AI timeout protection (`AbortController`, 60s) and bounded exponential-backoff
    retry on transient timeouts/5xx only (`src/lib/enhance-image.core.ts`).
  - Structured, PII-free JSON logging of the request lifecycle
    (`src/lib/logger.ts`).
  - Aggregate reliability/efficiency metrics (`src/lib/metrics.ts`) exposed at
    `/api/public/metrics`.
  - Enhancement logic extracted to a testable core module with a Vitest suite
    (`src/lib/enhance-image.core.test.ts`, 16 tests). `bun run test` script and
    a CI test step.

### Fixed

- Prettier formatting error in `src/components/LandingPage.tsx` that broke the
  lint gate.

## [0.1.0]

### Added

- Initial release: AI image enhancer / upscaler built on TanStack Start (SSR),
  React 19, Tailwind CSS v4, and the Lovable AI Gateway.
- Server route `/api/enhance-image` with Zod input validation.
- SSR error wrapper and security headers in `src/server.ts`.
- Analytics wiring (GA4 / Microsoft Clarity) and SEO metadata.
- Long-term caching policy for static assets (`public/_headers`).
