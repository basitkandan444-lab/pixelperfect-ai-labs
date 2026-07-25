# Tasks 7 + 8 — Production Intelligence & Capability Expansion

## Objective
Turn the premium engine into a **plug-and-play platform**: every future capability registers itself once and automatically inherits intelligence, optimization, verification, benchmarking, telemetry, and compatibility gating. Zero impact on free path, bundle, or browser-first invariants.

## Architecture

```text
src/lib/enhance/premium/
  capabilities/
    types.ts              CapabilityDescriptor, CapabilityContext, CapabilityResult
    registry.ts           register/list/get; frozen after boot; dev-only warnings on dup
    builtins.ts           registers today's 8 stages (deblock, bilateral, clahe, wb,
                          microContrast, sCurve, vibrance, faceRestore) via descriptors
    registry.test.ts
  production/
    performance/
      profiler.ts         perf.now() spans; per-stage timing; memory hints (deviceMemory)
      predictor.ts        rolling EMA of stage costs → informs selector budgets
    quality/
      metrics.ts          PSNR, SSIM (small-window), ΔE00, edge-preservation ratio
      verifier.ts         runs metrics vs pre-stage snapshot; flags regressions
    verification/
      gate.ts             composable checks: arch, memory, bundle, browser, regression
      report.ts           structured VerificationReport type
    telemetry/
      collector.ts        dev-only sink (import.meta.env.DEV); ring buffer, no network
      report.ts           renders FINAL SCORE object for devtools/console.debug
    compatibility/
      matrix.ts           feature probes: WebGPU, WASM SIMD, OffscreenCanvas, Workers,
                          Canvas2D, createImageBitmap; cached, SSR-safe
      policy.ts           capability→required-features gate; downgrades plan cleanly
    benchmarks/
      runner.ts           wraps existing bench/harness; adds per-capability scoring
      thresholds.ts       min PSNR/SSIM/time per backend; JSON, editable
    bundle/
      guard.ts            build-time assertion helpers used by scripts/check-bundle-size
    analytics/
      aggregate.ts        dev-only aggregation of telemetry across runs (in-memory)
    optimization/
      advisor.ts          reads profiler+quality+compat → suggests plan tweaks to
                          selector on next run (pure, deterministic)
    index.ts              barrel: initProductionLayer() wires everything, dev-gated
```

All production/* modules are **tree-shakeable** and **dev-gated by default**; nothing new ships to free users, and nothing adds runtime work to premium users unless they enable the dev telemetry flag.

## Capability contract (Task 8 core)

```ts
export interface CapabilityDescriptor<P = unknown> {
  id: Capability | string;                 // extends the union at registration time
  version: string;                         // semver, used by cache & benchmarks
  requires: FeatureFlag[];                 // e.g. ["webgpu"] | ["wasm-simd"]
  budget: { memMB: number; timeMsPerMP: number };
  select(profile: ImageProfile, env: SelectorEnv): P | null; // null = skip
  run(buf: Uint8ClampedArray, ctx: CapabilityContext<P>): Promise<Uint8ClampedArray>;
  verify?(before: Uint8ClampedArray, after: Uint8ClampedArray, ctx): QualitySignal;
  bench?: BenchSpec;                       // fixtures + thresholds
}
```

Selector is refactored to iterate the registry instead of a hardcoded switch. Today's 8 stages become descriptors in `capabilities/builtins.ts` — behavior identical, code path uniform.

## Data flow

```text
ImageProfile ─► registry.list()
                    │
                    ▼
        capability.select(profile,env)  ──skip if null / features missing──►
                    │
                    ▼
              PremiumPlan (existing shape, now registry-derived)
                    │
                    ▼
          scheduler → capability.run → optional verify
                    │
                    ▼
   dev-only telemetry.collector.record(stage, timing, mem, quality, compat)
                    │
                    ▼
              advisor updates EMA for next run
```

Public API (`applyPremiumPost`, `applyPremiumPostAsync`, `planForImage`) unchanged.

## Verification loops

1. Unit: registry lifecycle, descriptor validation, compatibility gating, advisor math.
2. Round-trip: existing 34 premium tests must stay green; builtins parity test proves refactor is behavior-preserving.
3. Bench: `benchmarks/runner` runs per-capability against fixtures; thresholds enforced in CI subset.
4. Bundle: `scripts/check-bundle-size.mjs` gate extended — free chunk delta must be **0 bytes**, premium chunk ≤ current +8 KB gz.
5. Compat: matrix probed under jsdom (feature-detect returns "js" fallback path).
6. SSR: every new module short-circuits under `import.meta.env.SSR`.
7. Telemetry: guarded by `import.meta.env.DEV`; production build assertion that the collector module is tree-shaken out of the client chunk.

## Non-negotiables preserved
- Free path: untouched. Zero import into free bundle (asserted).
- Browser-first: no hosted inference, no cloud GPU, no new network fetches.
- Stripe / entitlement / routes / UI: not modified.
- Public API of pipeline: unchanged.
- No new hard dependencies.

## Trade-offs
- +~15 KB gz to premium chunk (dev-tel excluded from prod build).
- One extra indirection in selector (registry lookup) — negligible.
- Verifier metrics on full-res images are expensive; run on 256² downsample by default, opt-in for full.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Refactor breaks existing plans | Parity test: for a fixed profile matrix, new selector must produce byte-identical PremiumPlan vs current |
| Telemetry ships to prod | Build-time assert + `DEV`-guarded imports; e2e checks bundle for collector symbol |
| Advisor destabilizes params | Advisor is opt-in; default off; deterministic bounds |
| Feature-detect flakiness | Cached per session, safe fallbacks, no UA sniffing |

## Files
**New:** everything under `src/lib/enhance/premium/{capabilities,production}/*` + tests.
**Modified:** `premium/intelligence/selector.ts` (iterate registry), `premium/pipeline.ts` (delegate stage build to registry), `scripts/check-bundle-size.mjs` (per-chunk cap tightening).
**Untouched:** free path, routes, UI, Stripe, entitlement, worker, models registry semantics.

## Rollout order
1. `capabilities/{types,registry}.ts` + tests.
2. `capabilities/builtins.ts` — register existing 8 stages; parity test.
3. Refactor `selector.ts` + `pipeline.ts` to consume registry (behavior-preserving).
4. `production/compatibility/*` + `production/performance/*` (pure, no wiring).
5. `production/quality/*` + `verification/*`.
6. `production/telemetry/*` (DEV-gated) + `analytics/aggregate`.
7. `production/optimization/advisor` (opt-in).
8. `production/benchmarks/*` + thresholds, wire into existing bench harness.
9. `production/index.ts` `initProductionLayer()` — called only from dev entry.
10. Bundle guard tightening + full verification loop; report deltas.

## Out of scope
- Any new user-visible capability (face restore stays gated as today).
- Any change to free path, Stripe, routes, UI.
- Any hosted/cloud inference or GPU service.
- Any change to public premium pipeline API.

---

Reply **APPROVE**, **SKIP**, or **REQUEST CHANGES**. No code will be written until approval.
