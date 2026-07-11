# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
