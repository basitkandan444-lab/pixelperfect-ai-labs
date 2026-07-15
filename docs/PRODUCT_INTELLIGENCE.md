# Product Intelligence (Module 6)

Evidence-based analytics derived from real event data in `public.events` and
persisted reliability history in `public.telemetry_snapshots`. Every number
returned by these endpoints is computed by a pure, unit-tested function from
raw rows — no hard-coded metrics, no assumptions.

## Public endpoints (`/api/public/*`)

All read-only, PII-free, no auth. Session IDs are never returned.

| Endpoint                                          | Purpose                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/public/funnel?hours=168`                | Ordered funnel `page_view → upload_completed → enhance_started → enhance_completed → download_completed`. Step conversion, drop-off, overall conversion. |
| `GET /api/public/cohorts?window=14&granularity=daily\|weekly\|monthly&retention_events=...` | Cohort retention matrix. Retention counts only MEANINGFUL events by default (`upload_completed, enhance_started, enhance_completed, download_completed`). Pass `retention_events=*` for legacy any-event behavior. |
| `GET /api/public/journeys?hours=168&topN=10`      | Full-flow session paths (page_view + product events + errors), terminals (success/error/abandonment), top loops, worst paths, feature interaction pairs, avg depth & duration. |
| `GET /api/public/experiments?hours=336&id=<opt>`  | Per-experiment A/B summaries: exposures, conversions, lift, two-proportion z-test p-value.  |
| `GET /api/public/anomalies?hours=24`              | z-score anomalies + linear trend on success_rate, p95_ms, LCP p75 from snapshots.           |
| `GET /api/public/intelligence?hours=168`          | Unified summary: funnel + cohorts + journeys + reliability anomalies + trends in one call.  |

All Wave B endpoints (`cohorts`, `journeys`, `intelligence`) are rate limited
per client IP with `X-RateLimit-*` headers and 429 + `Retry-After` on exhaustion.

## Pure libraries (unit-tested)

| Module                     | Purpose                                                                                                | Tests                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `src/lib/funnel.ts`        | Ordered funnel with first-timestamp per (session, step) and out-of-order rejection.                    | `src/lib/funnel.test.ts` — 7       |
| `src/lib/cohorts.ts`       | First-seen cohort retention with daily/weekly/monthly buckets and meaningful-event retention filter.   | `src/lib/cohorts.test.ts` — 8      |
| `src/lib/journey.ts`       | Per-session ordered paths across page_view + product events, terminal outcomes, loops, worst paths, feature interactions. | `src/lib/journey.test.ts` — 9      |
| `src/lib/experiments.ts`   | Deterministic FNV-1a hash → weighted variant assignment; per-variant conversion + z-test significance. | `src/lib/experiments.test.ts` — 11 |
| `src/lib/anomaly.ts`       | Rolling z-score anomaly detection, linear trend fit (slope/intercept/R²), Pearson correlation.         | `src/lib/anomaly.test.ts` — 10     |

## A/B testing wire format

Client emits two first-party events with an `metrics` payload:

```ts
track({
  name: "experiment_exposure",
  metrics: { experiment_id: "hero-cta-v1", variant: assignVariant("hero-cta-v1", sessionId, variants) },
});

track({
  name: "experiment_conversion",
  metrics: { experiment_id: "hero-cta-v1", variant },
});
```

Assignment is deterministic — the same session always sees the same variant
across reloads, workers and edges — so no DB write is required to enroll a
session. The `/api/public/experiments` endpoint aggregates exposures and
conversions (deduplicated per session per variant) and computes:

- `conversion_rate` per variant
- `lift_vs_control` — first variant alphabetically is the control
- `p_value_vs_control` — two-proportion z-test, two-sided
- `significant_95` — `p_value < 0.05`

## Verification examples

```bash
BASE=https://pixelperfect-ai-labs.lovable.app
curl -fsS "$BASE/api/public/funnel?hours=168"       | jq .data.funnel
curl -fsS "$BASE/api/public/cohorts?days=14"        | jq .data.cohorts
curl -fsS "$BASE/api/public/journeys?hours=168"     | jq .data.top_paths
curl -fsS "$BASE/api/public/anomalies?hours=48"     | jq .data
curl -fsS "$BASE/api/public/intelligence?hours=168" | jq .data
```
