# Deployment Guide

## Platform

This app is a TanStack Start (SSR) application built with Vite and deployed
through **Lovable** onto a Cloudflare Workers (edge) runtime.

- Preview: https://id-preview--34446754-4199-4528-b011-72bc3e10d075.lovable.app
- Production: https://pixelperfect-ai-labs.lovable.app
- Stable prod URL (immutable): https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app
- Stable preview URL (immutable): https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app

## How releases work

- **Frontend / UI changes** go live only after clicking **Update** in the
  Lovable publish dialog.
- **Backend changes** (server routes under `src/routes/api/`, SSR logic) deploy
  automatically.

## Pre-deploy checklist

1. `bun run check` passes (typecheck + lint + format).
2. `bun run build` succeeds locally.
3. CI is green on the branch.
4. Required env vars are configured for the target environment (see below).
5. `CHANGELOG.md` updated.

## Environment variables

| Variable                | Scope  | Purpose                                        |
| ----------------------- | ------ | ---------------------------------------------- |
| `LOVABLE_API_KEY`       | server | AI enhancement gateway key (never exposed)     |
| `VITE_GA4_ID`           | client | Google Analytics 4 measurement ID              |
| `VITE_CLARITY_ID`       | client | Microsoft Clarity project ID                   |
| `VITE_GSC_VERIFICATION` | client | Extra Google Search Console verification token |

`VITE_*` values ship in the client bundle (public by design). Server secrets are
read only inside route handlers.

## Post-deploy verification

1. Load production and confirm the page renders.
2. Hit the health endpoint:
   `curl -fsS https://pixelperfect-ai-labs.lovable.app/api/public/health`
   → expect `{"status":"ok",...}`.
3. Run one image enhancement end-to-end.
4. Check GA4 Realtime shows the pageview.
5. Watch error reporting for a spike after release.

## Rollback

See [`RUNBOOK.md`](./RUNBOOK.md#rollback).
