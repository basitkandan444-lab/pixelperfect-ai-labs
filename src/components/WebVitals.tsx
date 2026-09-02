import { useEffect } from "react";

/**
 * Mounts the Web Vitals collector after hydration. Renders nothing. Kept as a
 * component (not a raw effect in __root) so it colocates with <Analytics /> and
 * only runs on the client.
 */
export function WebVitals() {
  useEffect(() => {
    // Vitals are finalized asynchronously; defer the collector module so the
    // measurement code itself does not compete with hydration and LCP.
    const handle = setTimeout(() => {
      void import("@/lib/web-vitals").then(({ initWebVitals }) => initWebVitals());
    }, 3_000);
    return () => clearTimeout(handle);
  }, []);
  return null;
}
