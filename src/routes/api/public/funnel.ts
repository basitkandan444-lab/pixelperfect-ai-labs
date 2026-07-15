import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { computeFunnel, PRIMARY_FUNNEL } from "@/lib/funnel";
import { newRequestId } from "@/lib/logger";

// Aggregate, PII-free product funnel over the last N hours (default 168 = 7d).
// Returns per-step session counts + conversion rates. No session_ids leak.

const MAX_WINDOW_HOURS = 720; // 30 days
const MAX_ROWS = 50_000;

export const Route = createFileRoute("/api/public/funnel")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const hoursRaw = Number(url.searchParams.get("hours") ?? "168");
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(1, Math.min(MAX_WINDOW_HOURS, Math.floor(hoursRaw)))
          : 168;

        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("session_id, name, ts")
            .in("name", [...PRIMARY_FUNNEL])
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);

          if (error) {
            return jsonFail("internal_error", "Query failed.", { status: 500, requestId });
          }

          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            name: String(r.name),
            ts: String(r.ts),
          }));
          const funnel = computeFunnel(rows, [...PRIMARY_FUNNEL]);

          return jsonOk(
            {
              window_hours: hours,
              since,
              rows_scanned: rows.length,
              funnel,
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
