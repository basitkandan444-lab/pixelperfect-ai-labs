// Lightweight analytics helpers. IDs are supplied via env vars at build time so
// they can be added later without code changes. When an ID is absent, nothing loads.
// Env values are format-validated centrally in src/lib/env.ts.

import { clientEnv } from "./env";
import { track, type EventName } from "./track";

// GA4 measurement IDs are public (they ship in the client bundle either way).
// The env var takes precedence so it can be overridden per environment.
const GA4_DEFAULT = "G-NDDD496TZZ";

export const ANALYTICS = {
  ga4: clientEnv.VITE_GA4_ID || GA4_DEFAULT,
  clarity: clientEnv.VITE_CLARITY_ID,
  gscVerification: clientEnv.VITE_GSC_VERIFICATION,
};

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

// Bridge legacy event names (used across the app) to the first-party event
// vocabulary the Visitor Intelligence Command Center understands.
const NAME_MAP: Record<string, EventName> = {
  upload_start: "upload_started",
  upload: "upload_completed",
  enhance_start: "enhance_started",
  enhance_complete: "enhance_completed",
  enhance_fail: "enhance_failed",
  enhance_failed: "enhance_failed",
  download: "download_completed",
  page_view: "page_view",
  error: "error",
};

// Numeric field aliases the callers pass in various shapes. Normalising here
// prevents silent data loss (e.g. `durationMs` never landing in `duration_ms`).
function num(params: EventParams, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}
function str(params: EventParams, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

// Keys already promoted to first-class columns — do not duplicate into metrics.
const RESERVED = new Set([
  "duration_ms",
  "durationMs",
  "bytes",
  "size",
  "ok",
  "error_code",
  "feature",
]);

// Track a custom conversion / interaction event across the configured providers.
export function trackEvent(name: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params);
    window.clarity?.("event", name);
    // Forward to first-party store (privacy-preserving; no params containing PII).
    const mapped = NAME_MAP[name];
    // Preserve all non-reserved params as a dimensional metrics blob so
    // engine/accel/scale/resolution/format survive the bridge for p50/p95 and
    // segmentation analysis downstream. Values are enum-ish primitives only.
    const metrics: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (RESERVED.has(k)) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        metrics[k] = v;
      }
    }
    const hasMetrics = Object.keys(metrics).length > 0;
    if (mapped) {
      track({
        name: mapped,
        duration_ms: num(params, "duration_ms", "durationMs"),
        bytes: num(params, "bytes", "size"),
        ok:
          typeof params.ok === "boolean"
            ? params.ok
            : mapped === "enhance_failed"
              ? false
              : mapped === "enhance_completed" || mapped === "download_completed"
                ? true
                : undefined,
        error_code: str(params, "error_code"),
        feature: str(params, "feature"),
        metrics: hasMetrics ? metrics : undefined,
      });
    } else {
      track({
        name: "feature_interaction",
        feature: name,
        metrics: hasMetrics ? metrics : undefined,
      });
    }
  } catch {
    // Analytics must never break the app.
  }
}
