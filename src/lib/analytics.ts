// Three-source analytics bridge with schema normalization.
//
//   • First-party  → src/lib/track.ts (strict schema, event_id, seq, client_ts)
//   • GA4          → normalized snake_case params so all three sources speak
//                    the same field vocabulary and are mathematically
//                    reconcilable
//   • MS Clarity   → event name + numeric/enum tags via clarity('set', ...)
//                    so engine / accel / scale / error_code / ok survive
//
// IDs are supplied via env vars. Values are format-validated centrally in
// src/lib/env.ts.

import { clientEnv } from "./env";
import { track, type EventName } from "./track";

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

// Bridge legacy event names to first-party vocabulary. Legacy names are
// tolerated so scattered callers keep working; canonical names go through
// unchanged.
const NAME_MAP: Record<string, EventName> = {
  upload_start: "upload_started",
  upload_started: "upload_started",
  upload: "upload_completed",
  upload_completed: "upload_completed",
  enhance_start: "enhance_started",
  enhance_started: "enhance_started",
  enhance_complete: "enhance_completed",
  enhance_completed: "enhance_completed",
  enhance_fail: "enhance_failed",
  enhance_failed: "enhance_failed",
  enhance_abandoned: "enhance_abandoned",
  download: "download_completed",
  download_started: "download_started",
  download_completed: "download_completed",
  retry_performed: "retry_performed",
  timeout_occurred: "timeout_occurred",
  worker_crashed: "worker_crashed",
  page_view: "page_view",
  error: "error",
};

// Camel-case → snake_case aliases the bridge normalizes for GA4 and the
// first-party columns.
const KEY_ALIASES: Record<string, string> = {
  durationMs: "duration_ms",
  fileBytes: "file_bytes",
  srcW: "src_w",
  srcH: "src_h",
  srcPixels: "src_pixels",
  outW: "out_w",
  outH: "out_h",
  outPixels: "out_pixels",
  errorCode: "error_code",
};

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

const RESERVED = new Set([
  "duration_ms",
  "durationMs",
  "bytes",
  "size",
  "ok",
  "error_code",
  "errorCode",
  "feature",
]);

// Dimensions Clarity should tag on the session for cross-source filtering.
// These are enum-ish / small-cardinality strings — never PII.
const CLARITY_TAGS = new Set([
  "engine",
  "accel",
  "scale",
  "path",
  "tier",
  "error_code",
  "format",
  "device_type",
  "browser",
  "os",
]);

/** Normalize a params object: alias camelCase → snake_case, drop undefined. */
function normalize(params: EventParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const key = KEY_ALIASES[k] ?? k;
    out[key] = v;
  }
  return out;
}

/** Track a custom conversion / interaction event across ALL THREE sources. */
export function trackEvent(name: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  try {
    const norm = normalize(params);

    // 1) GA4 — normalized params (snake_case), same vocabulary as first-party.
    window.gtag?.("event", name, norm);

    // 2) Microsoft Clarity — event + numeric/enum session tags.
    window.clarity?.("event", name);
    for (const key of CLARITY_TAGS) {
      const v = norm[key];
      if (v !== undefined) window.clarity?.("set", key, String(v));
    }

    // 3) First-party — strict schema with reserved columns + metrics blob.
    const mapped = NAME_MAP[name];
    const metrics: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(norm)) {
      if (RESERVED.has(k)) continue;
      metrics[k] = v;
    }
    const hasMetrics = Object.keys(metrics).length > 0;
    if (mapped) {
      track({
        name: mapped,
        duration_ms: num(norm, "duration_ms"),
        bytes: num(norm, "bytes", "size"),
        ok:
          typeof norm.ok === "boolean"
            ? norm.ok
            : mapped === "enhance_failed" || mapped === "enhance_abandoned"
              ? false
              : mapped === "enhance_completed" || mapped === "download_completed"
                ? true
                : undefined,
        error_code: str(norm, "error_code"),
        feature: str(norm, "feature"),
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
