import { useEffect } from "react";

/**
 * Injects the Adsterra ad-network script on the client, exactly once, after
 * hydration so it never blocks first paint or SSR. The URL can be overridden
 * or disabled via `VITE_ADSTERRA_SCRIPT_URL` (set it to an empty string to
 * disable — useful for previews / e2e runs).
 */
const DEFAULT_ADSTERRA_SRC =
  "https://pl30377367.effectivecpmnetwork.com/fa/43/55/fa4355078a2e2a896de75fbec630d68a.js";

const SCRIPT_ID = "adsterra-loader";

export function AdsterraScript() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const configured = import.meta.env.VITE_ADSTERRA_SCRIPT_URL as string | undefined;
    // Explicit empty string disables; undefined falls back to the default URL.
    const src = configured === undefined ? DEFAULT_ADSTERRA_SRC : configured;
    if (!src) return;

    if (document.getElementById(SCRIPT_ID)) return;

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = src;
    s.async = true;
    s.referrerPolicy = "no-referrer-when-downgrade";
    // Adsterra scripts throw noisy runtime errors in some blocked environments;
    // swallow them so they never bubble into the app's error boundaries.
    s.onerror = () => {
      /* ignore — ad blockers, offline, or network failures must not break the app */
    };
    document.head.appendChild(s);
  }, []);

  return null;
}
