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
  upload: "upload_completed",
  enhance_start: "enhance_started",
  enhance_complete: "enhance_completed",
  download: "download_completed",
  page_view: "page_view",
  error: "error",
};

// Track a custom conversion / interaction event across the configured providers.
export function trackEvent(name: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params);
    window.clarity?.("event", name);
    // Forward to first-party store (privacy-preserving; no params containing PII).
    const mapped = NAME_MAP[name];
    if (mapped) {
      track({
        name: mapped,
        duration_ms: typeof params.duration_ms === "number" ? params.duration_ms : undefined,
        bytes: typeof params.size === "number" ? params.size : undefined,
        ok: typeof params.ok === "boolean" ? params.ok : undefined,
        error_code: typeof params.error_code === "string" ? params.error_code : undefined,
        feature: typeof params.feature === "string" ? params.feature : undefined,
      });
    } else {
      track({ name: "feature_interaction", feature: name });
    }
  } catch {
    // Analytics must never break the app.
  }
}

