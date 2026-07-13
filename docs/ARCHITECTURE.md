# Architecture

Pixel Perfect Pro is a free, AI-powered image enhancer. This document describes
how the codebase is organized, why the boundaries are drawn where they are, and
where new code should go. It is the reference for engineers extending the app.

## System overview

The app is a **server-rendered React application** built on **TanStack Start
v1** (TanStack Router + TanStack Query) and **Vite**, styled with **Tailwind
CSS v4** and shadcn/ui primitives. It runs on a **Cloudflare Workers** edge
runtime (`workerd`) via the Lovable Cloud platform. There is no persistent
database — the product is stateless: an image is uploaded, enhanced through the
current enhancement engine (the AI Gateway), returned, and downloaded. Nothing
is persisted after the request completes.

> **Current state vs. future direction.** As described here, the current
> enhancement engine runs enhancement on centralized infrastructure while
> development continues. The intended architectural direction moves enhancement
> toward participants' own devices, using centralized coordination only when
> required. See [Future execution direction](#future-execution-direction). Text
> below describes the current implementation unless explicitly noted.

```text
User
  │  selects a photo
  ▼
Frontend application (React 19, SSR + hydration)
  │  reads file as data URL, checks type/size client-side,
  │  POSTs { image, scale }
  ▼
Backend processing layer  ── POST /api/enhance-image (TanStack server route, edge)
  │  Content-Length guard → per-IP rate limit → request-id + structured log
  ▼
Validation (zod)
  │  format regex + size cap, then scale-specific prompt build
  ▼
AI Gateway (Lovable)
  │  timeout + bounded retry on transient 5xx/timeout,
  │  abort propagation on client disconnect
  ▼
Gemini image model  ──  google/gemini-3-pro-image
  │  returns enhanced image
  ▼
Enhanced image response  ──  { image } envelope + metrics
  ▼
Frontend application  ──  CompareSlider + download
```

**Where things happen today.**

- **Processing** occurs on centralized edge infrastructure (Cloudflare
  Workers) — the browser never runs the model; it uploads and displays.
- **Validation** is layered: cheap client-side type/size checks for UX, then
  authoritative server-side checks (Content-Length guard before buffering, then
  zod format + size validation) that the client cannot bypass.
- **Failures** map to typed responses: upstream `429`/`402`/`5xx` become clean
  client errors, transient upstream failures are retried with bounded
  exponential backoff, timeouts abort via `AbortController`, and client
  disconnects return `499` (tracked separately, never retried).
- **Request control**: per-IP rate limiting (15 req/min) with
  `Retry-After` / `X-RateLimit-*` headers throttles abuse before any AI call.
- **Infrastructure that exists today**: the edge runtime, the AI Gateway proxy,
  in-memory rate-limit + metrics state, and structured logging. There is no
  database, queue, or persistent store.

### Frontend architecture

- **Rendering**: SSR for first paint + SEO, then client hydration. Route
  metadata (`title`, canonical, Open Graph, JSON-LD) is produced per route via
  `head()` using the request origin resolved by `getRequestOrigin`.
- **State**: local component state (`useState`) drives the enhancer workflow
  (`idle → ready → loading → done`). TanStack Query is wired into router
  context for any future server-data reads; the current product has none.
- **Styling**: semantic design tokens live in `src/styles.css` (`@theme`).
  Components use token-based utility classes (`bg-primary`, `text-foreground`),
  never hardcoded colors, so theming stays centralized.

### Routing architecture

File-based routing under `src/routes/`. `routeTree.gen.ts` is generated — never
edited by hand. The route map:

- `index.tsx` — home / the enhancer tool (`/`).
- Eight SEO landing routes (`ai-image-enhancer`, `image-upscaler`,
  `fix-blurry-photo`, …) — thin route files that render the shared
  `LandingPage` from data in `src/lib/landing.ts`.
- Content/legal routes (`about`, `contact`, `privacy`, `terms`, `cookies`) —
  render through the shared `ContentPage` shell.
- `api/enhance-image.ts` — the AI enhancement HTTP endpoint.
- `api/public/health.ts` — unauthenticated uptime/health probe.
- `sitemap[.]xml.ts` — generated sitemap.

Each shareable route defines its own `head()` metadata. `og:image` is only set
on leaf routes and the root default — never duplicated into a layout.

### Server architecture

- **Server routes** (`src/routes/api/*`) handle raw HTTP: request validation
  with zod, calling the AI Gateway, and mapping upstream status codes
  (`429`, `402`, `5xx`) to clean client errors. Secrets (`LOVABLE_API_KEY`)
  are read **inside** the handler via `process.env`, never at module scope.
- **Isomorphic helpers** (`origin.functions.ts`) run on both server and
  client through `createIsomorphicFn`.
- **Edge hardening**: `src/server.ts` wraps the SSR handler to attach security
  headers, normalize catastrophic (h3-swallowed) SSR errors into a branded
  500 page, and log captured errors. `src/start.ts` adds request middleware
  that converts unhandled throws into a safe error page.

### AI enhancement request flow

1. The client reads the file as a data URL, validates type/size, and `POST`s
   `{ image, scale }` to `/api/enhance-image`.
2. The route validates the body with zod (format regex + size cap), builds a
   scale-specific prompt, and calls the Lovable AI Gateway image model.
3. Upstream errors map to typed responses; success extracts the image URL
   across possible response shapes and returns `{ image }`.
4. The client shows a before/after `CompareSlider` and enables download.
   Analytics events (`upload`, `enhance_start`, `enhance_complete`,
   `download`) are tracked throughout.

## Folder responsibilities

| Path                 | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `src/routes/`        | Pages + HTTP endpoints. Route config, `head()` metadata, route-specific logic. |
| `src/routes/api/`    | Server routes (HTTP). `api/public/*` bypasses auth on published sites.         |
| `src/components/`    | Reusable, presentational UI. No API calls, no env logic, no secrets.           |
| `src/components/ui/` | shadcn/ui primitives. Treat as a vendored library; edit sparingly.             |
| `src/hooks/`         | Reusable client-side behavior (e.g. `use-mobile`).                             |
| `src/lib/`           | Config + shared helpers: `site` (site config/SEO), `landing` (page data),      |
|                      | `analytics`, `utils`, isomorphic/server functions, error handling.             |
| `src/styles.css`     | Design tokens (`@theme`) and global styles. Single source of visual truth.     |
| `docs/`              | Engineering docs: architecture, deployment, runbook.                           |

## Developer guidelines

**Where new code goes**

- New page or endpoint → a file in `src/routes/` (endpoints under `api/`).
- New reusable UI → `src/components/` (presentation only).
- New client behavior/hook → `src/hooks/`.
- New shared data, config, or helper → `src/lib/`.
- New SEO landing page → add an entry to `src/lib/landing.ts` and a thin route
  file that renders `LandingPage`; do not duplicate markup.

**Architecture rules**

- Components stay presentational. Business logic, API calls, and environment
  access live in `src/lib/` or server routes — never in a component.
- Read secrets only inside server handlers via `process.env`. Never import
  server-only secrets into client-reachable modules or ship them to the client.
- Never edit `routeTree.gen.ts`; it is generated on build/dev.
- Use semantic design tokens for all colors/spacing. No hardcoded hex or
  `text-white`/`bg-black` in components.
- Keep a single source of truth: shared shells (`ContentPage`, `LandingPage`),
  shared primitives (`PageHeader`, `Section`), and site config (`lib/site.ts`).

**Naming conventions**

- Components: `PascalCase.tsx` exporting a `PascalCase` component.
- Hooks: `use-kebab-case.tsx`, exporting `useCamelCase`.
- Route files: TanStack file-based convention (dots → slashes, `$param`,
  `index`, `__root`).
- Server-callable modules: `*.functions.ts`; server-only helpers: `*.server.ts`.

**Quality gate** (must pass before merge):

```bash
bun run check   # typecheck + lint + format:check + tests
bun run build   # production build must succeed
```

**Architecture fitness functions** (enforced, not aspirational)

The architecture rules above are not just guidance — they are executed as
automated invariants in `src/lib/architecture.fitness.test.ts`, which runs in
the standard test gate (`bun run check` and CI). If a change inverts the
dependency direction (lib/components importing routes), leaks `process.env`
into a client-reachable module, reads secrets from a component, pulls the
router framework into `*.core.ts` logic, hand-edits `routeTree.gen.ts`, or
places a business HTTP endpoint outside `src/routes/api/`, the suite fails and
the build is blocked. This converts every rule below into a guardrail that
prevents architectural drift instead of merely describing it.



## Architecture layers

A single request touches five conceptual layers, all present today:

- **Frontend layer** — React 19 SSR + hydration. Renders the enhancer UI,
  performs client-side type/size pre-checks for fast feedback, and displays the
  before/after result.
- **Backend layer** — TanStack server routes on the edge. Owns authoritative
  validation, rate limiting, request IDs, error mapping, and the AI proxy.
- **AI processing layer** — the Lovable AI Gateway and the underlying image
  model. Currently centralized; the [Future execution direction](#future-execution-direction)
  describes moving this toward participant devices.
- **Monitoring layer** — structured PII-free logging (`src/lib/logger.ts`),
  aggregate reliability/efficiency metrics (`src/lib/metrics.ts`) at
  `/api/public/metrics`, the `/api/public/health` probe, and client analytics.
- **Security layer** — CSP and cross-origin isolation headers (`src/server.ts`),
  fail-fast env validation (`src/lib/env.ts`), server-only secret access, and
  payload-size guarding.

## Engineering principles

These principles guide changes and survive any future execution model:

- **Reliability first** — correctness and predictable failure handling take
  priority over new capability. Failures are typed, bounded, and observable.
- **Measurable improvements only** — changes justify themselves with evidence
  (metrics, tests, verification), not assumption.
- **Avoid unnecessary complexity** — prefer the simplest design that meets the
  requirement; no speculative infrastructure ahead of need.
- **Verify before completion** — typecheck, lint, format, tests, and a
  production build must pass before a change is considered done.

## Future migration philosophy

The system should evolve toward more efficient execution models **when
technically and economically justified** — never as a premature commitment.
Centralized processing is the current, correct choice; local device execution
(see below) is a direction to move toward as browser/device capabilities mature.
Each migration step must preserve the engineering principles above and keep the
**Current state** and **Future direction** in documentation explicitly separate.

## Future execution direction

This section describes the project's intended architectural direction. It is
**not yet implemented**.

### Current state

The current enhancement engine runs enhancement on centralized infrastructure —
the request is validated at the edge and processed through the AI Gateway (see
[System overview](#system-overview) and the enhancement request flow above).
This is what exists today.

### Future direction

The intended direction moves enhancement toward the participant's own device,
using centralized coordination only when required. This is planned, not present.

- **Local device execution** — enhancement runs on the participant's device
  rather than on centralized infrastructure. Execution targets are treated as
  interchangeable examples, not commitments; future targets may include WebGPU,
  WebNN, WebAssembly, ONNX Runtime, TensorFlow.js, native acceleration,
  Electron/Tauri desktop wrappers, PWAs, and future browser or engine APIs.
- **Hardware acceleration where available** — use whatever acceleration the
  execution environment exposes, with graceful fallback to CPU paths where
  acceleration is unavailable. No single accelerator is assumed to be permanent.
- **Graceful degradation** — environments without acceleration still work,
  trading throughput for compatibility rather than failing.
- **Scales with aggregate capability** — the system scales with the aggregate
  capability of participating devices rather than with centralized inference
  infrastructure, so each additional participant contributes its own
  computational capacity and the system grows with its user base with little
  additional centralized infrastructure.
- **Strong privacy posture** — content can be processed locally without leaving
  the device.
- **Execution-environment performance** — responsiveness, compatibility, and UX
  of the execution environment become primary engineering priorities.

Hybrid, offline, edge, and centralized execution may coexist; the wording above
is written to remain correct whichever combination is active.

### Rationale that survives migration

The design choices already in place — stopping abandoned requests immediately,
avoiding redundant processing, bounded retries, and reliability/efficiency
metrics — describe engineering outcomes (freeing processing resources, reducing
unnecessary computation, improving responsiveness) that remain accurate under
any execution model, whether processing happens on centralized infrastructure
today or on participant devices later.

### Transition posture

The current implementation may continue to use centralized processing during
development. Documentation must keep the **Current state** and **Future
direction** explicitly separated, and never present the future direction as
already implemented.
