import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { ANALYTICS } from "@/lib/analytics";
import { initTracker, track } from "@/lib/track";

/**
 * Injects Google Analytics 4 and Microsoft Clarity on the client only when the
 * corresponding IDs are provided via env vars. Also initializes the first-party
 * event tracker and fires a `page_view` on every route change. Renders nothing.
 */
export function Analytics() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
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
      s.type = "text/javascript";
      s.innerHTML = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`;
      document.head.appendChild(s);
    }

    initTracker();
  }, []);

  // Fire a first-party page_view on every route change (SPA nav included).
  useEffect(() => {
    if (typeof window === "undefined") return;
    track({ name: "page_view", path: pathname });
    window.gtag?.("event", "page_view", { page_path: pathname });
  }, [pathname]);

  return null;
}

