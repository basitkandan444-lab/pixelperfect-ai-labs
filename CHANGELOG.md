# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Testing

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
