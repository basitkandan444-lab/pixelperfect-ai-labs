import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { toDeliverable, webhookPayload } from "@/lib/alerts";
import { log, newRequestId } from "@/lib/logger";
import { buildReport, type SnapshotRow } from "@/lib/reliability";

// Alert Delivery Layer — cron scan.
//
// Runs after each telemetry snapshot: reads the last 24h of telemetry_snapshots,
// runs the reliability engine, and persists any newly-detected alerts into
// public.reliability_alerts (deduplicated by (kind, dedup_key, hour_bucket)).
// If RELIABILITY_ALERT_WEBHOOK_URL is configured, each freshly-inserted alert
// is POSTed there (Slack/Discord/HTTP-compatible payload).
//
// Auth: caller must present SUPABASE_PUBLISHABLE_KEY in `apikey` header.

export const Route = createFileRoute("/api/public/hooks/reliability-scan")({
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

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
          const { data, error } = await supabaseAdmin
            .from("telemetry_snapshots")
            .select("ts,requests,success_rate,avg_ms,p95_ms,lcp_p75,cls_p75,inp_p75,errors")
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(500);
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
          const report = buildReport(rows, 24);

          const deliverables = report.alerts.map(toDeliverable);
          const webhookUrl = process.env.RELIABILITY_ALERT_WEBHOOK_URL;
          let inserted = 0;
          let delivered = 0;
          let deliveryFailures = 0;

          for (const alert of deliverables) {
            // Upsert-with-onConflict is unavailable for our composite key
            // (kind, dedup_key, date_trunc('hour', ts)) because the hour bucket
            // is a generated default. Instead do a defensive INSERT and swallow
            // unique-violation errors — that's the dedupe path.
            const insertRes = await supabaseAdmin
              .from("reliability_alerts")
              .insert({
                kind: alert.kind,
                dedup_key: alert.dedup_key,
                severity: alert.severity,
                title: alert.title,
                detail: alert.detail,
                recommendation: alert.recommendation,
                evidence: alert.evidence,
              })
              .select("id")
              .maybeSingle();

            if (insertRes.error) {
              // 23505 = unique_violation → already delivered this hour bucket
              if (insertRes.error.code === "23505") continue;
              log.error("reliability_alert.insert_failed", {
                requestId,
                kind: alert.kind,
                message: insertRes.error.message,
              });
              continue;
            }
            inserted++;

            if (webhookUrl && insertRes.data?.id) {
              try {
                const resp = await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(webhookPayload(alert, "pixelperfect-ai")),
                });
                if (resp.ok) {
                  delivered++;
                  await supabaseAdmin
                    .from("reliability_alerts")
                    .update({
                      delivered_at: new Date().toISOString(),
                      delivery_status: "delivered",
                    })
                    .eq("id", insertRes.data.id);
                } else {
                  deliveryFailures++;
                  await supabaseAdmin
                    .from("reliability_alerts")
                    .update({
                      delivery_status: "failed",
                      delivery_error: `HTTP ${resp.status}`,
                    })
                    .eq("id", insertRes.data.id);
                }
              } catch (e) {
                deliveryFailures++;
                await supabaseAdmin
                  .from("reliability_alerts")
                  .update({
                    delivery_status: "failed",
                    delivery_error: e instanceof Error ? e.message : "unknown",
                  })
                  .eq("id", insertRes.data.id);
              }
            }
          }

          log.info("reliability_scan.completed", {
            requestId,
            scanned: rows.length,
            detected: deliverables.length,
            inserted,
            delivered,
            deliveryFailures,
            webhookConfigured: Boolean(webhookUrl),
          });

          return jsonOk(
            {
              scanned: rows.length,
              detected: deliverables.length,
              inserted,
              delivered,
              deliveryFailures,
              webhookConfigured: Boolean(webhookUrl),
              risk: report.risk,
            },
            { status: 200, requestId },
          );
        } catch (err) {
          log.error("reliability_scan.failed", {
            requestId,
            message: err instanceof Error ? err.message : String(err),
          });
          return jsonFail("internal_error", "Reliability scan failed.", {
            status: 500,
            requestId,
          });
        }
      },
    },
  },
});
