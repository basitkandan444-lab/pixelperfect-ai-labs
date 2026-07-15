import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import {
  computeCohorts,
  DEFAULT_RETENTION_EVENTS,
  type CohortGranularity,
} from "@/lib/cohorts";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

const MAX_WINDOW = 90;
const MAX_ROWS = 100_000;

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const Route = createFileRoute("/api/public/cohorts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();

        const rl = limiter.check(`cohorts:${clientKeyFromRequest(request)}`);
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
        const gRaw = (url.searchParams.get("granularity") ?? "daily").toLowerCase();
        const granularity: CohortGranularity =
          gRaw === "weekly" ? "weekly" : gRaw === "monthly" ? "monthly" : "daily";

        // Legacy `days` param → window buckets. New `window` param supersedes.
        const legacyDays = Number(url.searchParams.get("days"));
        const windowRaw = Number(url.searchParams.get("window") ?? legacyDays ?? "14");
        const windowBuckets = Number.isFinite(windowRaw)
          ? Math.max(2, Math.min(MAX_WINDOW, Math.floor(windowRaw)))
          : 14;

        // Lookback horizon: pull enough raw event history to build the buckets.
        const bucketDays =
          granularity === "monthly" ? 31 : granularity === "weekly" ? 7 : 1;
        const lookbackDays = Math.min(365, windowBuckets * bucketDays + 7);
        const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

        const retentionParam = url.searchParams.get("retention_events");
        const retentionEvents = retentionParam
          ? retentionParam
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 20)
          : [...DEFAULT_RETENTION_EVENTS];

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("session_id, ts, name")
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          if (error)
            return jsonFail("internal_error", "Query failed.", {
              status: 500,
              requestId,
              headers: rlHeaders,
            });
          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            ts: String(r.ts),
            name: String(r.name ?? ""),
          }));
          const truncated = rows.length >= MAX_ROWS;
          const result = computeCohorts(rows, windowBuckets, {
            granularity,
            retentionEvents,
          });
          return jsonOk(
            {
              since,
              rows_scanned: rows.length,
              truncated,
              row_cap: MAX_ROWS,
              ...result,
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
