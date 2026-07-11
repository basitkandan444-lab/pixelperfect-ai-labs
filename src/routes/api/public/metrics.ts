import { createFileRoute } from "@tanstack/react-router";

import { jsonOk } from "@/lib/api-response";
import { metrics } from "@/lib/metrics";

// Aggregate, PII-free reliability/cost metrics for the current worker isolate.
// Foundation for AI cost visibility — see src/lib/metrics.ts for the per-isolate
// limitation. Lives under /api/public/* so a monitor can scrape it without auth;
// it exposes only counts and durations, never user content.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/metrics       (prod)
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/metrics   (preview)

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async () => {
        return jsonOk(metrics.snapshot());
      },
    },
  },
});
