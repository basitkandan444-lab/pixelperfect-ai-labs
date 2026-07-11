import { createFileRoute } from "@tanstack/react-router";

// Lightweight liveness/health endpoint for uptime monitors (UptimeRobot,
// BetterStack, Pingdom, Cloudflare health checks, etc.). Lives under
// /api/public/* so it is reachable without authentication on published sites.
// Returns 200 + JSON when the SSR worker is serving requests.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/health       (prod)
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/health   (preview)

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          {
            status: "ok",
            service: "pixelperfect-ai",
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
