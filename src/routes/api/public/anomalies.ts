import { createFileRoute } from "@tanstack/react-router";

import { linearTrend, zscoreAnomalies } from "@/lib/anomaly";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

// Runs anomaly + trend detection over the persisted telemetry_snapshots table.
// Detects anomalies on success_rate, p95_ms, and lcp_p75 across the last N hours.

const MAX_HOURS = 720;
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const Route = createFileRoute("/api/public/anomalies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const rate = limiter.check(`anomalies:${clientKeyFromRequest(request)}`);
        if (!rate.allowed) {
          return jsonFail("rate_limited", "Too many requests.", {
            status: 429,
            requestId,
            headers: { "Retry-After": String(rate.resetSec) },
          });
        }
        const url = new URL(request.url);
        const hoursRaw = Number(url.searchParams.get("hours") ?? "24");
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(3, Math.min(MAX_HOURS, Math.floor(hoursRaw)))
          : 24;
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("telemetry_snapshots")
            .select("ts, success_rate, p95_ms, lcp_p75")
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(2000);
          if (error) return jsonFail("internal_error", "Query failed.", { status: 500, requestId });
          const rows = (data ?? []) as {
            ts: string;
            success_rate: number;
            p95_ms: number;
            lcp_p75: number;
          }[];
          const seriesFor = (k: "success_rate" | "p95_ms" | "lcp_p75") =>
            rows.map((r) => ({ ts: String(r.ts), value: Number(r[k]) || 0 }));

          const s_success = seriesFor("success_rate");
          const s_p95 = seriesFor("p95_ms");
          const s_lcp = seriesFor("lcp_p75");

          return jsonOk(
            {
              window_hours: hours,
              since,
              points: rows.length,
              anomalies: {
                success_rate: zscoreAnomalies(s_success),
                p95_ms: zscoreAnomalies(s_p95),
                lcp_p75: zscoreAnomalies(s_lcp),
              },
              trends: {
                success_rate: linearTrend(s_success),
                p95_ms: linearTrend(s_p95),
                lcp_p75: linearTrend(s_lcp),
              },
            },
            { status: 200, requestId },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
