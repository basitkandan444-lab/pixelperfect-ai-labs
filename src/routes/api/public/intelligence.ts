import { createFileRoute } from "@tanstack/react-router";

import { linearTrend, zscoreAnomalies } from "@/lib/anomaly";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { computeCohorts, DEFAULT_RETENTION_EVENTS } from "@/lib/cohorts";
import { computeFunnel, PRIMARY_FUNNEL } from "@/lib/funnel";
import { computeJourneys } from "@/lib/journey";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

// Unified Product Intelligence summary. One call returns funnel + cohorts +
// journeys (with terminals, loops, worst paths, feature interactions) +
// reliability anomalies. Every number is derived from real event data.

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const JOURNEY_EVENT_NAMES = [
  "page_view",
  "upload_started",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "enhance_failed",
  "download_completed",
  "error",
  "feature_interaction",
] as const;

export const Route = createFileRoute("/api/public/intelligence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();

        const rl = limiter.check(`intelligence:${clientKeyFromRequest(request)}`);
        const rlHeaders: Record<string, string> = {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetSec),
        };
        if (!rl.allowed) {
          return jsonFail("rate_limited", "Too many requests.", {
            status: 429,
            requestId,
            headers: { ...rlHeaders, "Retry-After": String(rl.resetSec) },
          });
        }

        const url = new URL(request.url);
        const hoursRaw = Number(url.searchParams.get("hours") ?? "168");
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(1, Math.min(720, Math.floor(hoursRaw)))
          : 168;
        const days = Math.max(2, Math.ceil(hours / 24));
        const since = new Date(Date.now() - hours * 3600_000).toISOString();
        const cohortSince = new Date(Date.now() - days * 86_400_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const [funnelRes, journeyRes, cohortRes, snapshotRes] = await Promise.all([
            supabaseAdmin
              .from("events")
              .select("session_id, name, ts")
              .in("name", [...PRIMARY_FUNNEL])
              .gte("ts", since)
              .order("ts", { ascending: true })
              .limit(50_000),
            supabaseAdmin
              .from("events")
              .select("session_id, path, name, ts, ok, metrics")
              .in("name", [...JOURNEY_EVENT_NAMES])
              .gte("ts", since)
              .order("ts", { ascending: true })
              .limit(50_000),
            supabaseAdmin
              .from("events")
              .select("session_id, name, ts")
              .gte("ts", cohortSince)
              .order("ts", { ascending: true })
              .limit(100_000),
            supabaseAdmin
              .from("telemetry_snapshots")
              .select("ts, success_rate, p95_ms, lcp_p75")
              .gte("ts", since)
              .order("ts", { ascending: true })
              .limit(2000),
          ]);

          const funnelRows = (funnelRes.data ?? []).map((r) => ({
            session_id: String(r.session_id),
            name: String(r.name),
            ts: String(r.ts),
          }));
          const journeyRows = (journeyRes.data ?? []).map((r) => {
            const metrics = (r as { metrics?: Record<string, unknown> | null }).metrics ?? null;
            const feat =
              metrics && typeof metrics.feature === "string" ? (metrics.feature as string) : null;
            return {
              session_id: String(r.session_id),
              path: (r.path ?? null) as string | null,
              name: String(r.name ?? ""),
              ts: String(r.ts),
              ok: (r.ok ?? null) as boolean | null,
              feature: feat,
            };
          });
          const cohortRows = (cohortRes.data ?? []).map((r) => ({
            session_id: String(r.session_id),
            name: String(r.name ?? ""),
            ts: String(r.ts),
          }));
          const snapRows = (snapshotRes.data ?? []) as {
            ts: string;
            success_rate: number;
            p95_ms: number;
            lcp_p75: number;
          }[];

          const funnel = computeFunnel(funnelRows, [...PRIMARY_FUNNEL]);
          const journeys = computeJourneys(journeyRows, { topN: 10 });
          const cohorts = computeCohorts(cohortRows, days, {
            granularity: "daily",
            retentionEvents: [...DEFAULT_RETENTION_EVENTS],
          });

          const seriesFor = (k: "success_rate" | "p95_ms" | "lcp_p75") =>
            snapRows.map((r) => ({ ts: String(r.ts), value: Number(r[k]) || 0 }));

          const anomalies = {
            success_rate: zscoreAnomalies(seriesFor("success_rate")),
            p95_ms: zscoreAnomalies(seriesFor("p95_ms")),
            lcp_p75: zscoreAnomalies(seriesFor("lcp_p75")),
          };
          const trends = {
            success_rate: linearTrend(seriesFor("success_rate")),
            p95_ms: linearTrend(seriesFor("p95_ms")),
            lcp_p75: linearTrend(seriesFor("lcp_p75")),
          };

          return jsonOk(
            {
              window_hours: hours,
              since,
              funnel,
              journeys,
              cohorts,
              reliability: { anomalies, trends, snapshot_points: snapRows.length },
            },
            { status: 200, requestId, headers: rlHeaders },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", {
            status: 500,
            requestId,
            headers: rlHeaders,
          });
        }
      },
    },
  },
});
