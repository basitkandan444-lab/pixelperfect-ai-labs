// Production-intelligence layer barrel. Importing this module is safe on the
// server (all sub-modules are SSR-guarded), but the live wiring —
// `initProductionLayer()` — is gated by DEV and no-ops otherwise.

import { installDevHook } from "./telemetry/collector";
import { detectFeatures } from "./compatibility/matrix";
import { freezeRegistry } from "../capabilities/registry";
import "../capabilities/builtins";

export * as compat from "./compatibility/matrix";
export * as policy from "./compatibility/policy";
export * as profiler from "./performance/profiler";
export * as predictor from "./performance/predictor";
export * as metrics from "./quality/metrics";
export * as verifier from "./quality/verifier";
export * as gate from "./verification/gate";
export * as telemetry from "./telemetry/collector";
export * as finalScore from "./telemetry/report";
export * as benchmarks from "./benchmarks/runner";
export * as thresholds from "./benchmarks/thresholds";
export * as advisor from "./optimization/advisor";
export * as aggregate from "./analytics/aggregate";
export * as bundleGuard from "./bundle/guard";

let initialized = false;

export async function initProductionLayer(): Promise<void> {
  if (initialized) return;
  initialized = true;
  freezeRegistry();
  if (typeof window === "undefined" || import.meta.env?.SSR) return;
  if (!import.meta.env?.DEV) return;
  installDevHook();
  await detectFeatures();
}
