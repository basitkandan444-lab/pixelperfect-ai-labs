import { createFileRoute } from "@tanstack/react-router";

import { jsonOk } from "@/lib/api-response";
import { BUILD_INFO, releaseTag } from "@/lib/build-info";
import { metrics } from "@/lib/metrics";
import { deploymentStatus } from "@/lib/ops";
import { vitals } from "@/lib/vitals-store";

// Aggregate, PII-free operational telemetry for the current worker isolate:
// reliability counters + error breakdown, Web Vitals field data, the derived
// deployment status, and the running release. This is the single scrape target
// for the command center and any external monitor. See src/lib/metrics.ts /
// vitals-store.ts for the per-isolate limitation.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/metrics
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/metrics

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async () => {
        const reliability = metrics.snapshot();
        return jsonOk({
          deployment: deploymentStatus(reliability),
          release: {
            version: BUILD_INFO.version,
            commit: BUILD_INFO.commit,
            release: releaseTag(),
            buildTime: BUILD_INFO.buildTime,
            mode: BUILD_INFO.mode,
          },
          reliability,
          vitals: vitals.snapshot(),
        });
      },
    },
  },
});
