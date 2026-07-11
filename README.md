# Pixel Perfect Pro

Free AI image enhancer and photo upscaler. Upload a low-quality photo and the
app sharpens blur, removes noise and upscales it to 4K or 8K — no signup, no
watermark. Built with TanStack Start (React 19 + SSR) on Vite and styled with
Tailwind CSS v4. The current enhancement engine processes images through the
Lovable AI Gateway (see [Future execution direction](#future-execution-direction)
for where this is headed).

## Tech stack

- **Framework:** TanStack Start v1 (file-based routing, SSR, server routes)
- **UI:** React 19, Tailwind CSS v4, shadcn/ui (Radix primitives), lucide-react
- **Data/validation:** TanStack Query, Zod
- **Build tool:** Vite
- **Hosting target:** Cloudflare Workers (edge) via nitro
- **AI:** Lovable AI Gateway (`google/gemini-3-pro-image`)

## Project structure

```text
public/                 Static assets (fonts, gallery images, icons, _headers, robots.txt)
src/
  components/           Reusable UI (CompareSlider, BeforeAfterGallery, SiteFooter, ...)
    ui/                 shadcn/ui primitives
  hooks/                Custom React hooks
  lib/                  Config + helpers (site.ts, analytics.ts, origin.functions.ts)
  routes/               File-based routes
    index.tsx           Home / enhancer workspace
    about|contact|...   Content pages
    api/enhance-image.ts  Server route that proxies the AI enhancement request
    sitemap[.]xml.ts    Dynamic sitemap
  router.tsx            Router + QueryClient bootstrap
  server.ts             SSR entry with security headers + error handling
  start.ts              Server middleware
  styles.css            Tailwind v4 theme + global styles
```

## Local development

Requirements: [Bun](https://bun.sh) (recommended) or Node 20+.

```bash
bun install
bun run dev        # start the dev server (http://localhost:8080)
```

## Build

```bash
bun run build      # production build
bun run preview    # preview the production build locally
```

## Quality checks

```bash
bun run typecheck  # tsc --noEmit (strict)
bun run lint       # ESLint + Prettier rules
bun run format     # auto-format with Prettier
bun run test       # Vitest unit tests
bun run check      # typecheck + lint + format check + test (the full local gate)
```

`bun run check` mirrors CI exactly — run it before every pull request.

## Environment variables

All are optional — the app boots without them. Copy `.env.example` to `.env`
for local development. Values are format-validated at startup in
`src/lib/env.ts`; malformed values fail fast (server) or warn loudly (optional
client analytics). Set production values in the Lovable Cloud secrets /
environment, never in a committed file.

| Variable                | Scope  | Purpose                                        |
| ----------------------- | ------ | ---------------------------------------------- |
| `LOVABLE_API_KEY`       | server | AI enhancement gateway key (never exposed)     |
| `VITE_GA4_ID`           | client | Google Analytics 4 measurement ID              |
| `VITE_CLARITY_ID`       | client | Microsoft Clarity project ID                   |
| `VITE_GSC_VERIFICATION` | client | Extra Google Search Console verification token |

`VITE_*` values ship in the client bundle (public by design). `LOVABLE_API_KEY`
is read only inside the server route handler and is never exposed to the browser.
Never put a secret behind a `VITE_` prefix.

## Release workflow

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. `bun run check` and `bun run build` pass locally.
3. Open a PR; CI (`.github/workflows/ci.yml`) must be green.
4. Squash-merge to `main`.
5. Frontend changes go live after clicking **Update** in the Lovable publish
   dialog; backend/server-route changes deploy automatically.

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for details.

## Troubleshooting

| Symptom                                        | Likely cause / fix                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `/api/enhance-image` returns `ai_unconfigured` | `LOVABLE_API_KEY` not set in the environment.                                     |
| Enhancement returns `rate_limited`             | Per-IP limit (15/min) hit — back off; honor the `Retry-After` header.             |
| Analytics not loading                          | `VITE_GA4_ID` / `VITE_CLARITY_ID` unset or malformed (see console warns).         |
| `Invalid server environment` on boot           | A server env var has an invalid format — check against `.env.example`.            |
| 404 on refresh of a deep link                  | Confirm the route file exists under `src/routes/`; never edit `routeTree.gen.ts`. |
| Health check                                   | `curl -fsS <url>/api/public/health` → `{"status":"ok",...}`.                      |

## Future execution direction

This describes the project's intended architectural direction — **not yet
implemented**. The two states are kept explicitly separate.

**Current state.** The current enhancement engine processes images on
centralized infrastructure through the Lovable AI Gateway (see
[Tech stack](#tech-stack)). This is what exists today.

**Future direction.** The intended direction moves enhancement toward the
participant's own device, using centralized coordination only when required:

- **Local device execution** — enhancement runs on the participant's device
  rather than on centralized infrastructure. Execution targets are examples, not
  commitments; future targets may include WebGPU, WebNN, WebAssembly, ONNX
  Runtime, TensorFlow.js, native acceleration, Electron/Tauri, PWAs, and future
  browser or engine APIs.
- **Hardware acceleration where available** — use whatever acceleration the
  execution environment exposes, with graceful fallback to CPU paths. No single
  accelerator is assumed permanent.
- **Graceful degradation** — environments without acceleration still work.
- **Scales with aggregate capability** — the system scales with the aggregate
  capability of participating devices rather than with centralized
  infrastructure, so each additional participant contributes its own
  computational capacity.
- **Strong privacy posture** — content can be processed locally without leaving
  the device.
- **Execution-environment performance** — responsiveness, compatibility, and UX
  become primary engineering priorities.

Hybrid, offline, edge, and centralized execution may coexist. The current
implementation may continue to use centralized processing during development.
See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#future-execution-direction)
for the full rationale.

## Deployment

Deploys through Lovable. Frontend changes go live after clicking **Update** in
the publish dialog; backend changes (server routes) deploy automatically.

- Preview: https://id-preview--34446754-4199-4528-b011-72bc3e10d075.lovable.app
- Production: https://pixelperfect-ai-labs.lovable.app
