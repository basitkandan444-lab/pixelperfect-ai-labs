import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { computeJourneys } from "@/lib/journey";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

const MAX_HOURS = 720;
const MAX_ROWS = 100_000;

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// Wave B: pull page_view + product events + feature_interaction so journeys
// reflect the full flow (upload → enhance → download / error), not just page
// navigation. Session outcomes are classified as success/error/abandonment.
const JOURNEY_EVENT_NAMES = [
  "page_view",
  "upload_started",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "download_completed",
  "error",
  "feature_interaction",
] as const;

export const Route = createFileRoute("/api/public/journeys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();

        const rl = limiter.check(`journeys:${clientKeyFromRequest(request)}`);
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
          ? Math.max(1, Math.min(MAX_HOURS, Math.floor(hoursRaw)))
          : 168;
        const topN = Math.max(
          1,
          Math.min(50, Math.floor(Number(url.searchParams.get("topN") ?? "10"))),
        );
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("session_id, path, name, ts, ok, metrics")
            .in("name", [...JOURNEY_EVENT_NAMES])
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          if (error)
            return jsonFail("internal_error", "Query failed.", {
              status: 500,
              requestId,
              headers: rlHeaders,
            });
          const rows = (data ?? []).map((r) => {
            const metrics = (r as { metrics?: Record<string, unknown> | null }).metrics ?? null;
            const feat =
              metrics && typeof metrics.feature === "string"
                ? (metrics.feature as string)
                : null;
            return {
              session_id: String(r.session_id),
              path: (r.path ?? null) as string | null,
              name: String(r.name ?? ""),
              ts: String(r.ts),
              ok: (r.ok ?? null) as boolean | null,
              feature: feat,
            };
          });
          const truncated = rows.length >= MAX_ROWS;
          const result = computeJourneys(rows, { topN });
          return jsonOk(
            {
              window_hours: hours,
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
