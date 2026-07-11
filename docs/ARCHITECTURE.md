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
AI Gateway, returned, and downloaded. Nothing is stored server-side.

> **Current implementation vs. future direction.** As described here, image
> enhancement currently runs through the current enhancement runtime while
> development continues. The long-term direction is a **browser-first execution
> model** where enhancement runs on the user's own hardware. See
> [Future browser-first architecture](#future-browser-first-architecture). Text
> below describes the current implementation unless explicitly noted.

```text
Browser (React 19)
  │  upload image (data URL)
  ▼
POST /api/enhance-image   ── TanStack server route (edge)
  │  builds prompt, validates input (zod)
  ▼
Lovable AI Gateway  ──  google/gemini-3-pro-image
  │  returns enhanced image
  ▼
Browser  ──  CompareSlider + download
```

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
bun run check   # typecheck + lint + format:check
bun run build   # production build must succeed
```

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
