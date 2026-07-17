import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { buildReport, type SnapshotRow } from "@/lib/reliability";

// Reliability Intelligence — public read-back.
//
// Returns the last `windowHours` (default 24, max 168) of telemetry snapshots,
// plus rule-based alerts and short-horizon trend forecasts. PII-free: rows are
// aggregate numbers, never user data.

export const Route = createFileRoute("/api/public/reliability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const window = Math.min(
          168,
          Math.max(1, Number(url.searchParams.get("windowHours") ?? 24)),
        );
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const since = new Date(Date.now() - window * 3_600_000).toISOString();
          const { data, error } = await supabaseAdmin
            .from("telemetry_snapshots")
            .select(
              "ts,requests,success_rate,avg_ms,p95_ms,lcp_p75,cls_p75,inp_p75,errors,deployment",
            )
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(2000);
          if (error) throw error;
          const rows: SnapshotRow[] = (data ?? []).map((r) => ({
            ts: r.ts as string,
            requests: r.requests ?? 0,
            success_rate: Number(r.success_rate ?? 1),
            avg_ms: r.avg_ms ?? 0,
            p95_ms: r.p95_ms ?? 0,
            lcp_p75: Number(r.lcp_p75 ?? 0),
            cls_p75: Number(r.cls_p75 ?? 0),
            inp_p75: Number(r.inp_p75 ?? 0),
            errors: (r.errors as Record<string, number>) ?? {},
          }));
          const report = buildReport(rows, window);
          return jsonOk({ ...report, series: rows }, { requestId });
        } catch (err) {
          return jsonFail("internal_error", err instanceof Error ? err.message : "Failed", {
            status: 500,
            requestId,
          });
        }
      },
    },
  },
});
