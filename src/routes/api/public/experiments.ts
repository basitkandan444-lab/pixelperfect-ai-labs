import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { summarizeExperiments } from "@/lib/experiments";
import { newRequestId } from "@/lib/logger";

const MAX_HOURS = 720;
const MAX_ROWS = 50_000;

export const Route = createFileRoute("/api/public/experiments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const hoursRaw = Number(url.searchParams.get("hours") ?? "336"); // 14 days
        const hours = Number.isFinite(hoursRaw)
          ? Math.max(1, Math.min(MAX_HOURS, Math.floor(hoursRaw)))
          : 336;
        const experimentId = url.searchParams.get("id");
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const q = supabaseAdmin
            .from("events")
            .select("session_id, name, ts, metrics")
            .in("name", ["experiment_exposure", "experiment_conversion"])
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(MAX_ROWS);
          const { data, error } = await q;
          if (error) return jsonFail("internal_error", "Query failed.", { status: 500, requestId });
          const rows = (data ?? []).map((r) => ({
            session_id: String(r.session_id),
            name: String(r.name),
            ts: String(r.ts),
            metrics: (r.metrics ?? null) as { experiment_id?: string | null; variant?: string | null } | null,
          }));
          let summaries = summarizeExperiments(rows);
          if (experimentId) summaries = summaries.filter((s) => s.experiment_id === experimentId);
          return jsonOk(
            { window_hours: hours, since, rows_scanned: rows.length, experiments: summaries },
            { status: 200, requestId },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
