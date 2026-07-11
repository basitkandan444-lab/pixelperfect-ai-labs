# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  - Aggregate reliability/cost metrics (`src/lib/metrics.ts`) exposed at
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
