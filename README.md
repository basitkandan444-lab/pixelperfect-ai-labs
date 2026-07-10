# Pixel Perfect Pro

Free AI image enhancer and photo upscaler. Upload a low-quality photo and the
app sharpens blur, removes noise and upscales it to 4K or 8K — no signup, no
watermark. Built with TanStack Start (React 19 + SSR) on Vite, styled with
Tailwind CSS v4, and enhanced server-side through the Lovable AI Gateway.

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
bun run lint       # ESLint + Prettier rules
bun run format     # auto-format with Prettier
```

## Environment variables

All are optional — the app runs without them. Set them in the Lovable Cloud
secrets / environment for production.

| Variable               | Purpose                                              |
| ---------------------- | --------------------------------------------------- |
| `LOVABLE_API_KEY`      | Server-side key for the AI enhancement gateway      |
| `VITE_GA4_ID`          | Google Analytics 4 measurement ID (client)          |
| `VITE_CLARITY_ID`      | Microsoft Clarity project ID (client)               |
| `VITE_GSC_VERIFICATION`| Extra Google Search Console verification token      |

Never commit secrets. `LOVABLE_API_KEY` is read only inside the server route
handler and is never exposed to the browser.

## Deployment

Deploys through Lovable. Frontend changes go live after clicking **Update** in
the publish dialog; backend changes (server routes) deploy automatically.

- Preview: https://id-preview--34446754-4199-4528-b011-72bc3e10d075.lovable.app
- Production: https://pixelperfect-ai-labs.lovable.app
