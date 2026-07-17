import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import type { ExperimentDefinition } from "@/lib/experiments";
import { summarizeExperiments } from "@/lib/experiments";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

const MAX_HOURS = 720;
const MAX_ROWS = 50_000;

// Per-IP quota: aggregates are cheap but a scraper hammering this endpoint
// still costs Postgres cycles. Fixed 60 req/min/IP is well above legitimate
// admin polling and cuts obvious abuse. Isolated per worker (see rate-limit.ts).
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const Route = createFileRoute("/api/public/experiments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();

        const key = `experiments:${clientKeyFromRequest(request)}`;
        const rl = limiter.check(key);
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
        const hoursRaw = Number(url.searchParams.get("hours") ?? "336"); // 14 days
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(1, Math.min(MAX_HOURS, Math.floor(hoursRaw)))
          : 336;
        const experimentId = url.searchParams.get("id");
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Load experiment definitions so lift/p-value are computed against
          // the DECLARED control variant, not the alphabetic first arm.
          const defsQuery = supabaseAdmin
            .from("experiments" as never)
            .select("id, key, variants" as never);
          const { data: defsData, error: defsError } = (await defsQuery) as {
            data: Array<{ id: string; key: string; variants: unknown }> | null;
            error: unknown;
          };
          if (defsError) {
            return jsonFail("internal_error", "Experiments query failed.", {
              status: 500,
              requestId,
              headers: rlHeaders,
            });
          }
          const definitions: ExperimentDefinition[] = (defsData ?? [])
            .filter((r) => Array.isArray(r.variants))
            .map((r) => ({
              id: r.id,
              key: r.key,
              variants: r.variants as ExperimentDefinition["variants"],
            }));

          const q = supabaseAdmin
            .from("events")
            .select("session_id, name, ts, metrics")
            .in("name", ["experiment_exposure", "experiment_conversion"])
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          const { data, error } = await q;
          if (error)
            return jsonFail("internal_error", "Query failed.", {
              status: 500,
              requestId,
              headers: rlHeaders,
            });

          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            name: String(r.name),
            ts: String(r.ts),
            metrics: (r.metrics ?? null) as {
              experiment_id?: string | null;
              variant?: string | null;
            } | null,
          }));
          const truncated = rows.length >= MAX_ROWS;

          let summaries = summarizeExperiments(rows, definitions);
          if (experimentId) summaries = summaries.filter((s) => s.experiment_id === experimentId);

          return jsonOk(
            {
              window_hours: hours,
              since,
              rows_scanned: rows.length,
              truncated,
              row_cap: MAX_ROWS,
              experiments: summaries,
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
