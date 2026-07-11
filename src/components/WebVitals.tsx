import { useEffect } from "react";

import { initWebVitals } from "@/lib/web-vitals";

/**
 * Mounts the Web Vitals collector after hydration. Renders nothing. Kept as a
 * component (not a raw effect in __root) so it colocates with <Analytics /> and
 * only runs on the client.
 */
export function WebVitals() {
  useEffect(() => {
    initWebVitals();
  }, []);
  return null;
}
