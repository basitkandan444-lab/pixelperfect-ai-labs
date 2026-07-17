import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { log, newRequestId } from "@/lib/logger";
import { metrics } from "@/lib/metrics";
import { deploymentStatus } from "@/lib/ops";
import { vitals } from "@/lib/vitals-store";

// Persistent Observability Storage — cron sink.
//
// Called by pg_cron every N minutes. Captures the current worker's
// reliability + vitals snapshot as a row in `public.telemetry_snapshots`
// so historical trends survive isolate restarts. PII-free by construction:
// only aggregate numeric telemetry is persisted.
//
// Access control: the caller must present the project's SUPABASE_PUBLISHABLE_KEY
// in the `apikey` header. That is the same key pg_cron already holds, so no
// new secret is required. Fails closed on missing / mismatched keys.

export const Route = createFileRoute("/api/public/hooks/telemetry-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return jsonFail("unauthorized", "Invalid or missing apikey.", {
            status: 401,
            requestId,
          });
        }

        const reliability = metrics.snapshot();
        const v = vitals.snapshot();
        const status = deploymentStatus(reliability);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("telemetry_snapshots").insert({
            deployment: status,
            requests: reliability.requests,
            success: reliability.success,
            failure: reliability.failure,
            success_rate: reliability.successRate,
            avg_ms: reliability.avgDurationMs,
            p95_ms: reliability.p95DurationMs,
            lcp_p75: v.metrics.LCP.p75,
            cls_p75: v.metrics.CLS.p75,
            inp_p75: v.metrics.INP.p75,
            fcp_p75: v.metrics.FCP.p75,
            ttfb_p75: v.metrics.TTFB.p75,
            samples: v.samples,
            errors: reliability.errors,
          });
          if (error) throw error;
          log.info("telemetry_snapshot.inserted", {
            requestId,
            deployment: status,
            requests: reliability.requests,
          });
          return jsonOk({ ok: true, deployment: status }, { status: 202, requestId });
        } catch (err) {
          log.error("telemetry_snapshot.failed", {
            requestId,
            message: err instanceof Error ? err.message : String(err),
          });
          return jsonFail("internal_error", "Snapshot insert failed.", {
            status: 500,
            requestId,
          });
        }
      },
    },
  },
});
