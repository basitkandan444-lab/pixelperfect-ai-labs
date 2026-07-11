# Testing & Quality Guide

This document is the single source of truth for how PixelPerfect AI Labs is
tested. It explains the testing philosophy, the layers, how to run and debug
each one, and how they are enforced in CI. A new senior engineer should be able
to read this and be productive without asking anyone.

## Philosophy

1. **Test behaviour at the right layer.** Framework-agnostic business logic is
   unit-tested (fast, exhaustive, no browser). User-facing behaviour is verified
   end-to-end in real browser engines. We do not re-test the same thing twice at
   different layers.
2. **Determinism over coverage theatre.** Every test must pass or fail for a
   real reason. No `sleep`-based waits, no snapshots that flake on animation
   phase, no coverage padding of untested files.
3. **Fail safely, leak nothing.** Security and error paths are first-class test
   subjects — not afterthoughts.
4. **The AI gateway is never called in tests.** All enhancement requests are
   mocked, so the suite is offline, free and reproducible.

## Test layers

| Layer                | Tool                     | Location                     | Runs on            |
| -------------------- | ------------------------ | ---------------------------- | ------------------ |
| Unit / logic         | Vitest (`node`)          | `src/lib/*.test.ts`          | every push / PR    |
| Component            | Vitest (`jsdom`) + RTL   | `src/components/*.test.tsx`  | every push / PR    |
| HTTP integration     | Vitest (`node`)          | `src/lib/enhance-image.http.test.ts` | every push / PR |
| Load / concurrency   | Vitest (`node`)          | `src/lib/enhance-image.load.test.ts` | every push / PR |
| E2E functional       | Playwright               | `e2e/enhance-journey.spec.ts`, `e2e/failure-scenarios.spec.ts` | every push / PR |
| Network resilience   | Playwright (CDP offline) | `e2e/network.spec.ts`        | every push / PR    |
| Accessibility        | Playwright + axe-core    | `e2e/a11y.spec.ts`           | every push / PR    |
| Visual regression    | Playwright screenshots   | `e2e/visual.spec.ts`         | every push / PR    |

### Browser matrix

Playwright runs five projects: `desktop-chromium`, `desktop-firefox`,
`desktop-webkit`, `mobile-chrome` (Pixel 5) and `mobile-safari` (iPhone 13).

- **Functional, network and accessibility** specs run on all five so engine-
  specific rendering, upload, pointer, keyboard and a11y differences (Blink /
  Gecko / WebKit) are caught on desktop and mobile.
- **Visual-regression baselines** are intentionally scoped to two projects
  (`desktop-chromium` + `mobile-chrome`). Pixel-exact snapshots are per-engine
  and per-OS; maintaining WebKit/Firefox baselines would multiply flake and
  maintenance for little added signal — layout regressions surface on Chromium
  just as reliably, and cross-engine *behaviour* is covered by the functional
  and a11y suites. The scoping is enforced by a guard in `e2e/visual.spec.ts`.

## Running tests

```bash
bun run test            # all unit/component/integration/load tests (Vitest)
bun run test:watch      # Vitest in watch mode
bun run test:coverage   # Vitest with the coverage gate (see thresholds below)
bun run test:e2e        # all Playwright specs across the 5-project matrix
bun run test:e2e:update # re-generate visual snapshots (review the diff!)
bun run check           # typecheck + lint + format:check + test (pre-push gate)
```

Run a single E2E project or file while iterating:

```bash
bunx playwright test --project=desktop-chromium e2e/a11y.spec.ts
```

## Coverage gate

`bun run test:coverage` enforces thresholds (lines 90 / functions 90 /
branches 85 / statements 90) scoped to the tested, framework-agnostic business
logic: `enhance-image.core`, `rate-limit`, `metrics`, `api-response`, `landing`.
UI and presentational modules are deliberately excluded — they are exercised by
Playwright, so counting them here would produce a misleading number and punish
the wrong layer. Current: ~98.8% lines / ~94.5% branches.

## Accessibility

`e2e/a11y.spec.ts` runs axe-core against the WCAG 2.1 A/AA rule set on the fully
hydrated app (landing, uploaded and result states) across every engine, plus
explicit landmark, single-H1, keyboard-operability and slider-ARIA checks, and a
`prefers-reduced-motion` (WCAG 2.3.3) behavioural check. **The whole page is
scanned — including toasts.** Do not add axe `.exclude()` calls to hide
failures; fix the underlying markup/tokens instead. Toasts use design tokens
(`bg-background` / `text-foreground`, an AA pairing), not sonner's low-contrast
`richColors` palette.

## Debugging a failure

1. **Read the failure.** Vitest prints the assertion; Playwright prints the
   selector and call log.
2. **Open the Playwright HTML report** (uploaded as the `playwright-report` CI
   artifact on every run) for traces, videos and screenshots. Locally:
   `bunx playwright show-report`.
3. **Open a trace** for a full time-travel view (network, DOM snapshots,
   console): `bunx playwright show-trace test-results/<...>/trace.zip`.
   Traces and videos are retained `on-first-retry`.
4. **Reproduce in one engine** with `--project=desktop-chromium` before fanning
   out.

## Adding tests

- **New business logic** → a `*.test.ts` beside it. If it should count toward
  coverage, add the file to `vitest.config.ts` `coverage.include`.
- **New user-facing behaviour** → an `e2e/*.spec.ts` using the shared helpers in
  `e2e/helpers.ts` (role/label-based locators, the `/api/enhance-image` mock,
  hydration-aware upload). Never hard-code sleeps; wait on a signal.
- **New visual state worth guarding** → add a `toHaveScreenshot` in
  `e2e/visual.spec.ts`, generate the baseline with `test:e2e:update`, review the
  PNG in the diff, and commit it. Baselines under `e2e/**-snapshots/` are
  committed to git (they are the source of truth); other test output
  (`coverage/`, `playwright-report/`, `test-results/`) is git-ignored.

## CI pipeline

`.github/workflows/ci.yml` runs three jobs on every push and PR to `main`:

1. **quality** — typecheck, lint, format:check, `test:coverage` (uploads the
   `coverage` artifact), production build.
2. **e2e** — installs Chromium + Firefox + WebKit, runs the full Playwright
   matrix, and always uploads the `playwright-report` artifact (timings on a
   pass; traces/videos/screenshots on a failure).
3. **audit** — `bun audit` for dependency advisories (reported, non-blocking).

CI runs Playwright with `retries: 2` and `workers: 1` for stability, and
`forbidOnly` so a stray `test.only` fails the build.
