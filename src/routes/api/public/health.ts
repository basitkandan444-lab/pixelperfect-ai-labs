import { createFileRoute } from "@tanstack/react-router";

import { BUILD_INFO, buildAgeSeconds, releaseTag } from "@/lib/build-info";
import { metrics } from "@/lib/metrics";
import { deploymentStatus } from "@/lib/ops";

// Deployment health check for uptime monitors (UptimeRobot, BetterStack,
// Pingdom, Cloudflare health checks) AND the Developer Command Center.
//
// `status` is a pure LIVENESS signal (the worker is serving) so monitors that
// expect `{"status":"ok"}` keep working. `deployment` is the derived SERVICE
// status (operational / degraded / outage) from the reliability metrics, and
// `checks` reports individual readiness probes. Everything is PII-free.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/health
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/health

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const snap = metrics.snapshot();
        const aiConfigured = Boolean(process.env.LOVABLE_API_KEY);
        const uptimeSeconds = Math.max(
          0,
          Math.floor((Date.now() - Date.parse(snap.since)) / 1000),
        );

        return Response.json(
          {
            status: "ok",
            service: "pixelperfect-ai",
            deployment: deploymentStatus(snap),
            version: BUILD_INFO.version,
            commit: BUILD_INFO.commit,
            release: releaseTag(),
            buildTime: BUILD_INFO.buildTime,
            buildAgeSeconds: buildAgeSeconds(),
            mode: BUILD_INFO.mode,
            uptimeSeconds,
            checks: {
              server: true,
              ai_configured: aiConfigured,
            },
            timestamp: new Date().toISOString(),
          },
          {
            headers: {
              // Never cache health probes.
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          },
        );
      },
    },
  },
});
