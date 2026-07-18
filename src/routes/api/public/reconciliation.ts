import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

// DATA TRUST — Mathematical Reconciliation Report.
//
// This endpoint returns the numbers an engineer or auditor needs to answer
// "how do you know these counts are correct?" It computes:
//
//   • total_events / distinct_events (event_id) → duplication rate
//   • sessions with sequence gaps → beacon loss detection
//   • orphan enhance_started (no terminal within window) → hidden abandonment
//   • terminal count breakdown (completed / failed / abandoned)
//   • download completion count
//   • coverage: % of enhance events with duration_ms, ok, metrics populated
//
// If ANY of these disagree with intuition, the system tells us — it never
// silently averages the discrepancy away.

const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

interface RawRow {
  event_id: string | null;
  session_id: string;
  seq: number | null;
  name: string;
  ts: string;
  duration_ms: number | null;
  ok: boolean | null;
  metrics: Record<string, unknown> | null;
}

export const Route = createFileRoute("/api/public/reconciliation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();

        const rl = limiter.check(`recon:${clientKeyFromRequest(request)}`);
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
          ? Math.max(1, Math.min(720, Math.floor(hoursRaw)))
          : 168;
        const since = new Date(Date.now() - hours * 3600_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("events")
            .select("event_id, session_id, seq, name, ts, duration_ms, ok, metrics")
            .gte("ts", since)
            .order("ts", { ascending: true })
            .limit(100_000);
          if (error) {
            return jsonFail("internal_error", "Query failed.", {
              status: 500,
              requestId,
              headers: rlHeaders,
            });
          }

          const rows = (data ?? []) as RawRow[];
          const totalEvents = rows.length;

          // --- duplication ---
          const idSeen = new Set<string>();
          let duplicates = 0;
          let withEventId = 0;
          for (const r of rows) {
            if (r.event_id) {
              withEventId++;
              if (idSeen.has(r.event_id)) duplicates++;
              else idSeen.add(r.event_id);
            }
          }

          // --- sequence gaps ---
          // Group seq values per session and count missing integers between
          // min and max. Sessions without any seq are counted separately.
          const seqBySession = new Map<string, number[]>();
          let rowsWithSeq = 0;
          for (const r of rows) {
            if (r.seq === null) continue;
            rowsWithSeq++;
            const arr = seqBySession.get(r.session_id) ?? [];
            arr.push(r.seq);
            seqBySession.set(r.session_id, arr);
          }
          let sessionsWithGaps = 0;
          let missingSeq = 0;
          for (const arr of seqBySession.values()) {
            if (arr.length < 2) continue;
            const min = Math.min(...arr);
            const max = Math.max(...arr);
            const expected = max - min + 1;
            if (arr.length < expected) {
              sessionsWithGaps++;
              missingSeq += expected - arr.length;
            }
          }

          // --- orphan starts (no terminal for enhance_started) ---
          const startedBySession = new Map<string, number>();
          const terminalBySession = new Map<string, number>();
          const counts = {
            enhance_started: 0,
            enhance_completed: 0,
            enhance_failed: 0,
            enhance_abandoned: 0,
            upload_started: 0,
            upload_completed: 0,
            download_started: 0,
            download_completed: 0,
            page_view: 0,
            error: 0,
          };
          for (const r of rows) {
            if (r.name in counts) (counts as Record<string, number>)[r.name]++;
            if (r.name === "enhance_started") {
              startedBySession.set(r.session_id, (startedBySession.get(r.session_id) ?? 0) + 1);
            } else if (
              r.name === "enhance_completed" ||
              r.name === "enhance_failed" ||
              r.name === "enhance_abandoned"
            ) {
              terminalBySession.set(r.session_id, (terminalBySession.get(r.session_id) ?? 0) + 1);
            }
          }
          let orphanStarts = 0;
          for (const [sid, started] of startedBySession) {
            const term = terminalBySession.get(sid) ?? 0;
            if (started > term) orphanStarts += started - term;
          }

          // --- coverage: enhance events with populated fields ---
          const enhanceRows = rows.filter(
            (r) =>
              r.name === "enhance_completed" ||
              r.name === "enhance_failed" ||
              r.name === "enhance_abandoned",
          );
          const withDuration = enhanceRows.filter((r) => r.duration_ms != null).length;
          const withOk = enhanceRows.filter((r) => r.ok != null).length;
          const withMetrics = enhanceRows.filter(
            (r) => r.metrics && Object.keys(r.metrics).length > 0,
          ).length;

          // --- mathematical trust score ---
          // 100% when: no duplicates, no gaps, no orphans, full coverage.
          const denom = Math.max(1, totalEvents);
          const dupPct = duplicates / denom;
          const gapPct = rowsWithSeq === 0 ? 0 : missingSeq / (rowsWithSeq + missingSeq);
          const orphanPct =
            counts.enhance_started === 0 ? 0 : orphanStarts / counts.enhance_started;
          const coveragePct =
            enhanceRows.length === 0
              ? 1
              : (withDuration + withOk + withMetrics) / (3 * enhanceRows.length);
          const trust = Math.max(
            0,
            Math.min(1, 1 - dupPct - gapPct - orphanPct + (coveragePct - 1)),
          );

          return jsonOk(
            {
              window_hours: hours,
              since,
              totals: {
                events: totalEvents,
                with_event_id: withEventId,
                distinct_event_ids: idSeen.size,
                duplicates,
              },
              integrity: {
                sessions_with_gaps: sessionsWithGaps,
                missing_seq_events: missingSeq,
                orphan_enhance_starts: orphanStarts,
              },
              counts,
              coverage: {
                enhance_terminal_rows: enhanceRows.length,
                with_duration_ms: withDuration,
                with_ok: withOk,
                with_metrics: withMetrics,
              },
              trust_score: Number(trust.toFixed(4)),
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
