// Client-side Web Vitals collection — the browser half of the performance
// dashboard. Uses the standard `web-vitals` library (Google) to measure real
// Core Web Vitals from actual sessions, then:
//   1. beacons them to /api/public/vitals for server-side aggregation, and
//   2. forwards them to the analytics providers as custom events.
//
// Field data (RUM) — not synthetic — so the /ops dashboard reflects what users
// actually experience. Runs once per page load, client only.

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

import { trackEvent } from "./analytics";

const ENDPOINT = "/api/public/vitals";

function send(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    // CLS is unitless and fractional; timing metrics are whole ms.
    value: metric.name === "CLS" ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
    rating: metric.rating,
  });

  try {
    // sendBeacon survives page unload (the moment LCP/CLS/INP finalize).
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry must never break the app.
  }

  // Forward to analytics for cohort/segment analysis (GA4 / Clarity).
  trackEvent("web_vital", {
    metric_name: metric.name,
    value: metric.value,
    rating: metric.rating,
  });
}

let started = false;

/** Register all Web Vitals listeners exactly once. Safe to call on every mount. */
export function initWebVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  onLCP(send);
  onCLS(send);
  onINP(send);
  onFCP(send);
  onTTFB(send);
}
