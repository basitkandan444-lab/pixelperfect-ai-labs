# Observability & Operational Telemetry

This app is instrumented so every deployment is **observable, measurable,
debuggable, and self-auditing**. This document is the map of that system.

## The Developer Command Center — `/ops`

A single live operational view of the running deployment. It polls the public
telemetry endpoints every 5s and shows:

- **Service status** — operational / degraded / outage, derived from real
  reliability metrics (see [`src/lib/ops.ts`](../src/lib/ops.ts)).
- **Release intelligence** — the exact version, commit and build age that is
  live, plus isolate uptime and readiness checks.
- **Reliability** — request volume, success rate, p95 latency, and the distinct
  rejection/abort categories.
- **Runtime errors** — aggregated by stable error code (PII-free).
- **Web Vitals** — real field data (p75) for LCP, CLS, INP, FCP, TTFB with
  Core Web Vitals ratings.
- **Bundle budgets** — the client-payload ceilings enforced in CI.

`/ops` is `noindex` and disallowed in `robots.txt`. It reads only public,
PII-free telemetry, so it exposes nothing a monitor couldn't already scrape.

## Telemetry endpoints (`/api/public/*`)

| Endpoint              | Method   | Purpose                                                       |
| --------------------- | -------- | ------------------------------------------------------------- |
| `/api/public/health`  | GET      | Liveness (`status: ok`) + deployment status, checks, uptime.  |
| `/api/public/version` | GET      | Release intelligence: version, commit, build time & age.      |
| `/api/public/metrics` | GET      | Reliability + error breakdown + Web Vitals + release.         |
| `/api/public/vitals`  | GET/POST | Aggregate Web Vitals (GET) / browser beacon ingestion (POST). |

All are under `/api/public/*` so uptime monitors and dashboards can scrape them
without auth. They return only counts, durations and enums — never user content.

## How the telemetry is produced

- **Reliability & runtime errors** — [`src/lib/metrics.ts`](../src/lib/metrics.ts)
  aggregates counters and per-code error tallies as the enhance endpoint runs.
- **Web Vitals** — [`src/lib/web-vitals.ts`](../src/lib/web-vitals.ts) collects
  real Core Web Vitals in the browser (Google `web-vitals` lib) and beacons them
  to `/api/public/vitals`, where [`src/lib/vitals-store.ts`](../src/lib/vitals-store.ts)
  aggregates them into p75 + rating buckets. They are also forwarded to GA4.
- **Release metadata** — [`src/lib/build-info.ts`](../src/lib/build-info.ts) is
  baked in at build time via Vite `define` (version, commit, build timestamp).
- **Structured logs** — [`src/lib/logger.ts`](../src/lib/logger.ts) emits one
  JSON line per event with a correlatable `requestId`.

### Known limitation

Metrics and vitals are aggregated **per worker isolate** and reset on cold
start (same tradeoff as the rate limiter). They give a live, PII-free snapshot
and a clean seam to push to a time-series sink (Grafana, Datadog, a Cloud DB)
when persistent history is needed.

## Release intelligence in CI

- **Bundle monitoring** — `bun run bundle:check`
  ([`scripts/check-bundle-size.mjs`](../scripts/check-bundle-size.mjs)) fails CI
  if the client payload exceeds the budgets in `src/lib/ops.ts`. A unit test
  keeps the script's inlined numbers in sync with the shared source.
- The commit SHA is injected from CI env (`GITHUB_SHA`, etc.), so
  `/api/public/version` reports exactly which commit is live.

## Verifying after a deploy

```bash
BASE=https://pixelperfect-ai-labs.lovable.app
curl -fsS $BASE/api/public/health   | jq .          # liveness + deployment status
curl -fsS $BASE/api/public/version  | jq .data       # confirm the rollout landed
curl -fsS $BASE/api/public/metrics  | jq .data       # reliability + vitals
```

Then open `/ops` and confirm status is **Operational** and no error codes are
accumulating.

## Persistent time-series (Level 5)

Per-isolate counters in `metrics.ts` / `vitals-store.ts` are volatile. To keep
historical trends we persist a periodic snapshot to `public.telemetry_snapshots`:

- `POST /api/public/hooks/telemetry-snapshot` — cron sink (auth: `apikey` header
  must match `SUPABASE_PUBLISHABLE_KEY`). Writes one row containing deployment
  status, reliability counters, error-code breakdown, and Core Web Vitals p75s.
- `pg_cron` job `telemetry-snapshot-5m` runs every 5 minutes.
- `GET /api/public/reliability?windowHours=24` returns the recent series plus:
  - **alerts** — rule-based detections (`error_spike`, `success_rate_drop`,
    `latency_regression`, `lcp_regression`, `inp_regression`, `traffic_drop`,
    `new_error_code`) with severity, evidence and a recommended action.
  - **trends** — linear-regression forecast (`slopePerHour`, `projected1h`,
    `projected24h`) for success rate, p95 latency and LCP p75, tagged
    `improving` / `steady` / `degrading`.
  - **risk** — 0..1 composite score for at-a-glance dashboards.

Detection logic lives in `src/lib/reliability.ts` (pure, unit-tested) and is
reused by dashboards, MCP tooling, and notifiers.

## Alert delivery (Level 5)

- `POST /api/public/hooks/reliability-scan` — auth via `apikey` header. Runs
  every 5 minutes (`pg_cron` job `reliability-alert-scan-5m`). Fetches the last
  24h of telemetry snapshots, runs `buildReport`, and persists each new alert
  into `public.reliability_alerts`, deduplicated by
  `(kind, dedup_key, hour_bucket)` — the same ongoing incident writes exactly
  one row per hour.
- If the `RELIABILITY_ALERT_WEBHOOK_URL` secret is configured, every newly-inserted
  alert is POSTed there with a flat, Slack/Discord/HTTP-compatible payload
  (`title`, `severity`, `detail`, `recommendation`, `evidence`, `text`). Delivery
  status (`delivered` / `failed` + `delivery_error`) is written back to the row.
- `GET /api/public/alerts?windowHours=24` returns the recent alerts (PII-free)
  for dashboards and external monitors.
- Dedup logic lives in `src/lib/alerts.ts` (`dedupKey`, `toDeliverable`,
  `webhookPayload`) — pure functions, unit-tested in `src/lib/alerts.test.ts`.
