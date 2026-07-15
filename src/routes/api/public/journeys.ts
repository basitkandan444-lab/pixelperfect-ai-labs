import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { computeJourneys } from "@/lib/journey";
import { newRequestId } from "@/lib/logger";

const MAX_HOURS = 720;
const MAX_ROWS = 100_000;

export const Route = createFileRoute("/api/public/journeys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const hoursRaw = Number(url.searchParams.get("hours") ?? "168");
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(1, Math.min(MAX_HOURS, Math.floor(hoursRaw)))
          : 168;
        const topN = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get("topN") ?? "10"))));
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("session_id, path, ts")
            .eq("name", "page_view")
            .gte("ts", since)
            .not("path", "is", null)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          if (error) return jsonFail("internal_error", "Query failed.", { status: 500, requestId });
          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            path: String(r.path ?? ""),
            ts: String(r.ts),
          }));
          const result = computeJourneys(rows, { topN });
          return jsonOk(
            { window_hours: hours, since, rows_scanned: rows.length, ...result },
            { status: 200, requestId },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
