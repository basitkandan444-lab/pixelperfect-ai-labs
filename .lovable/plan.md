# Tasks 9 + 10 — Production/Conversion Intelligence & Elite Evolution Engine

## Objective

Close the Pixel Perfect Pro architecture with two additive layers that turn existing signals (telemetry, capability registry, Stripe subscriptions, first-party events) into **evidence-driven recommendations** — without touching the free path, the browser-first engine, or any public API.

- **Task 9** — Production & Conversion Intelligence: unify what already exists (events, subscriptions, capabilities, vitals, reliability) into a single query surface answering "who did what, why, and what did it cost / earn".
- **Task 10** — Elite Evolution Engine: a pure recommendations layer that reads Task 9's aggregates + the capability registry + bundle/perf budgets and emits ranked, typed recommendations. Read-only. Never auto-applies.

## Architecture

```text
src/lib/intelligence/                         (server-only aggregation)
  conversion/
    funnel.ts           upload→enhance→download→wall→checkout→active
    upgrade-reasons.ts  last capability + plan before checkout_started
    retention.ts        active / churned / grace from subscriptions
    capability-value.ts capability × (completion, download, upgrade) rates
  performance/
    by-browser.ts       p50/p95 enhance_ms grouped by browser/os/device
    by-capability.ts    per-stage cost from telemetry snapshots
    bottlenecks.ts      slowest stage vs budget from capability registry
  revenue/
    mrr.ts              active subs × price → MRR / ARR bands
    ltv.ts              avg lifetime months × price (bounded, no PII)
  intelligence.server.ts   thin barrel; each fn is createServerFn + admin role gate

src/lib/evolution/                            (pure, deterministic)
  types.ts              Recommendation, Severity, Evidence, Category
  rules/
    conversion.ts       wall-abandon > X% ⇒ improve messaging
    performance.ts      browser slowdown > X% ⇒ fallback tuning
    capability.ts       usage skew ⇒ prioritize / expand / retire
    bundle.ts           free-chunk delta > 0 ⇒ split premium
    quality.ts          verifier warn rate > X% ⇒ tune stage
    memory.ts           peak MB > budget ⇒ pool / tile
  engine.ts             runs rules(inputs) → Recommendation[]; sorted, deduped
  engine.test.ts

src/routes/api/public/
  intelligence/conversion.ts   GET aggregates (admin-gated via has_role)
  intelligence/performance.ts  GET aggregates
  intelligence/revenue.ts      GET aggregates (bands only, no PII)
  evolution/recommendations.ts GET Recommendation[]  (rules(engine(inputs)))
```

No new tables. No new secrets. No new client bundles. All reads go through `requireSupabaseAuth` + `has_role(_, 'admin')`; non-admins get 403.

## Data sources (already in production)

- `events` — funnel, capability usage, wall hits, abandonments, error_code, metrics blob
- `subscriptions` — active / cancelled / current_period_end → retention, MRR, LTV bands
- `telemetry_snapshots` — perf/vitals aggregates by browser/device
- `reliability_alerts` — quality/perf regressions feed evolution rules
- Capability registry (`src/lib/enhance/premium/capabilities/*`) — budgets, requires, version
- Bundle guard output (`scripts/check-bundle-size.mjs`) — free-chunk delta

## Recommendation contract

```ts
export type Category =
  "conversion" | "performance" | "capability" | "bundle" | "quality" | "memory";
export type Severity = "info" | "warn" | "critical";

export interface Evidence {
  metric: string;
  value: number;
  threshold: number;
  window: string;
  sample: number;
}
export interface Recommendation {
  id: string; // stable hash of {category, subject, window}
  category: Category;
  severity: Severity;
  subject: string; // e.g. "capability:faceRestore", "browser:safari"
  title: string; // one-line action
  rationale: string; // human, evidence-linked
  evidence: Evidence[];
  action: { kind: "plan-required"; note: string }; // never auto-apply
  createdAt: string;
}
```

Engine is pure: `engine(inputs) → Recommendation[]`. No I/O, fully unit-testable.

## Verification loops

1. Unit: each rule with fixture inputs → expected recommendations (sorted, deduped, stable ids).
2. Aggregation: SQL fns tested against seeded rows; bounded row counts; no PII in output.
3. RBAC: non-admin GET → 403; admin GET → 200 with typed payload.
4. Free-path: bundle guard must show **0 bytes** delta on the free chunk (asserted in CI).
5. SSR: every new module short-circuits on `import.meta.env.SSR` where it touches browser APIs (none should).
6. Registry parity: existing 34 premium tests + capability registry tests stay green.
7. Determinism: engine output stable for a fixed input snapshot (golden test).

## Non-negotiables preserved

- Free path, worker, models, routes, UI: untouched.
- Browser-first: no hosted inference, no cloud GPU, no new network calls from client.
- Stripe/entitlement: read-only consumers of `subscriptions` / `has_premium`.
- Public premium API: unchanged.
- No new tables, no schema migrations, no new secrets.
- Recommendations are advisory; they gate on human APPROVE — nothing self-applies.

## Trade-offs

- Aggregations run on-demand per admin request; if load grows, add a nightly materialized snapshot (out of scope now).
- Rule thresholds start conservative and are versioned in `evolution/rules/*` — tuning is a normal PR.
- LTV is a bounded estimate (avg months × price), not per-user — deliberately no PII.

## Risks & mitigations

| Risk                      | Mitigation                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Query cost on `events`    | Time-window filter + indexed columns already in place; cap row scan per call                                 |
| PII leakage in aggregates | Aggregates only; no user_id / email in responses; typed response contracts                                   |
| Recommendation noise      | Severity thresholds + dedup by stable id + min sample size per rule                                          |
| Free bundle regression    | Everything server-only under `src/lib/intelligence` / `src/lib/evolution`; bundle guard asserts 0-byte delta |
| Rule drift                | Golden fixture test per rule; engine determinism test                                                        |

## Files

**New:** `src/lib/intelligence/**`, `src/lib/evolution/**`, `src/routes/api/public/intelligence/*.ts`, `src/routes/api/public/evolution/recommendations.ts`, matching `*.test.ts`.
**Modified:** none in free path. `scripts/check-bundle-size.mjs` reads unchanged; assertion tightened if needed.
**Untouched:** enhance engine, premium pipeline, capability registry semantics, routes/UI, Stripe, worker, models.

## Rollout order

1. `evolution/types.ts` + `engine.ts` + tests (pure, no deps).
2. Rules one at a time with fixtures: bundle → capability → performance → conversion → quality → memory.
3. `intelligence/*` aggregators, each with a SQL-level test.
4. Admin-gated API routes; RBAC tests.
5. Wire evolution route to consume intelligence aggregates.
6. Bundle-guard verification + full test suite.
7. Report deltas: LOC, bundle bytes (free = 0), test count.

## Out of scope

- Any UI surface (no admin dashboard reintroduced — memory forbids it).
- Any new capability, model, or pipeline change.
- Auto-applying recommendations, background jobs, or cron.
- Per-user analytics or any PII surface.
- Hosted/cloud inference of any kind.

---

Reply **APPROVE**, **SKIP**, or **REQUEST CHANGES**. No code will be written until approval.
