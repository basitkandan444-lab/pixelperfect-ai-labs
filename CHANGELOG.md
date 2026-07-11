# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
