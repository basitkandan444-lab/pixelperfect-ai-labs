import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { computeCohorts } from "@/lib/cohorts";
import { newRequestId } from "@/lib/logger";

const MAX_DAYS = 90;
const MAX_ROWS = 100_000;

export const Route = createFileRoute("/api/public/cohorts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const daysRaw = Number(url.searchParams.get("days") ?? "14");
        const days = Number.isFinite(daysRaw)
          ? Math.max(2, Math.min(MAX_DAYS, Math.floor(daysRaw)))
          : 14;
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("session_id, ts")
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          if (error) return jsonFail("internal_error", "Query failed.", { status: 500, requestId });
          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            ts: String(r.ts),
          }));
          const result = computeCohorts(rows, days);
          return jsonOk(
            { window_days: days, since, rows_scanned: rows.length, ...result },
            { status: 200, requestId },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
