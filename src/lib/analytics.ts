// Lightweight analytics helpers. IDs are supplied via env vars at build time so
// they can be added later without code changes. When an ID is absent, nothing loads.
// Env values are format-validated centrally in src/lib/env.ts.

import { clientEnv } from "./env";

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

// Track a custom conversion / interaction event across the configured providers.
export function trackEvent(name: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params);
    window.clarity?.("event", name);
  } catch {
    // Analytics must never break the app.
  }
}
