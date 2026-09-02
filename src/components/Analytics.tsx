import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { ANALYTICS } from "@/lib/analytics";
import { initBehavior } from "@/lib/behavior";
import { initTracker, track } from "@/lib/track";

/**
 * Injects Google Analytics 4 and Microsoft Clarity on the client only when the
 * corresponding IDs are provided via env vars. Also initializes the first-party
 * event tracker and fires a `page_view` on every route change. Renders nothing.
 */
export function Analytics() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    let cancelled = false;
    let cancelScheduledAnalytics: (() => void) | undefined;

    const loadThirdPartyAnalytics = () => {
      if (cancelled) return;
      const { ga4, clarity } = ANALYTICS;

      if (ga4 && !document.getElementById("ga4-src")) {
        const s = document.createElement("script");
        s.id = "ga4-src";
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4}`;
        document.head.appendChild(s);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() {
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer!.push(arguments);
        };
        window.gtag("js", new Date());
        window.gtag("config", ga4, { anonymize_ip: true });
      }

      if (clarity && !document.getElementById("clarity-src")) {
        const s = document.createElement("script");
        s.id = "clarity-src";
        s.async = true;
        s.src = `https://www.clarity.ms/tag/${clarity}`;
        document.head.appendChild(s);
      }
    };

    // Third-party analytics are the single largest main-thread cost on first
    // load, so they are deferred until the visitor actually engages with the
    // page (pointer, keyboard, scroll or touch), with a long idle fallback so
    // passive readers are still counted. This keeps them out of the critical
    // path entirely without losing measurement.
    const INTERACTION_EVENTS = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
      "wheel",
    ] as const;

    let fallbackHandle: ReturnType<typeof setTimeout> | undefined;

    const startAnalytics = () => {
      cleanupTriggers();
      loadThirdPartyAnalytics();
    };

    function cleanupTriggers() {
      for (const evt of INTERACTION_EVENTS) {
        window.removeEventListener(evt, startAnalytics);
      }
      if (fallbackHandle !== undefined) clearTimeout(fallbackHandle);
    }

    const scheduleAnalytics = () => {
      for (const evt of INTERACTION_EVENTS) {
        window.addEventListener(evt, startAnalytics, { once: true, passive: true });
      }
      fallbackHandle = setTimeout(startAnalytics, 12_000);
      cancelScheduledAnalytics = cleanupTriggers;
    };

    if (document.readyState === "complete") scheduleAnalytics();
    else window.addEventListener("load", scheduleAnalytics, { once: true });


    initTracker();
    initBehavior();

    // Global failure intelligence — nothing may be invisible.
    // 1) Uncaught runtime errors → track('error') with taxonomy
    const onError = (e: ErrorEvent) => {
      track({
        name: "error",
        ok: false,
        error_code: (e.error && (e.error as Error).name) || "uncaught_error",
        metrics: {
          message: String(e.message ?? "").slice(0, 200),
          source: String(e.filename ?? "").slice(0, 200),
          lineno: e.lineno ?? 0,
          colno: e.colno ?? 0,
        },
      });
    };
    // 2) Unhandled promise rejections → often mask worker crashes / OOM
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const isError = reason instanceof Error;
      track({
        name: "error",
        ok: false,
        error_code: isError ? reason.name : "unhandled_rejection",
        metrics: {
          message: String(isError ? reason.message : reason).slice(0, 200),
        },
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleAnalytics);
      cancelScheduledAnalytics?.();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Fire a first-party page_view on every route change (SPA nav included).
  useEffect(() => {
    if (typeof window === "undefined") return;
    track({ name: "page_view", path: pathname });
    window.gtag?.("event", "page_view", { page_path: pathname });
  }, [pathname]);

  return null;
}
