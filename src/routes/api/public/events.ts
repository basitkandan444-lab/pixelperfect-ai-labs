import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";

// Privacy-preserving event ingestion. No PII: we do NOT store IPs, user-agent
// strings, or user IDs. Only classified/derived fields the client sent.
//
// DATA TRUST guarantees implemented here:
//   • event_id uniqueness → duplicate beacons are dropped, ingest is idempotent
//   • seq per session      → server can detect gaps (missing events) later
//   • client_ts            → out-of-order events can be reordered downstream
//   • server ACK           → client learns which event_ids landed
//
// This endpoint is public by design (browsers post here). It is size-capped
// and validates every field to keep the store clean and bounded.

const EVENT_NAMES = [
  "page_view",
  "route_change",
  "upload_started",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "enhance_failed",
  "enhance_abandoned",
  "download_started",
  "download_completed",
  "retry_performed",
  "timeout_occurred",
  "visibility_change",
  "tab_closed",
  "worker_crashed",
  "error",
  "feature_interaction",
  "session_summary",
  "experiment_exposure",
  "experiment_conversion",
] as const;

const EventSchema = z.object({
  event_id: z.string().uuid().optional(),
  seq: z.number().int().nonnegative().max(1_000_000).optional(),
  client_ts: z.string().datetime().optional(),
  session_id: z.string().min(8).max(64),
  name: z.enum(EVENT_NAMES),
  path: z.string().max(512).optional(),
  referrer_host: z.string().max(255).optional(),
  source: z.string().max(32).optional(),
  medium: z.string().max(64).optional(),
  campaign: z.string().max(128).optional(),
  timezone: z.string().max(64).optional(),
  language: z.string().max(12).optional(),
  device_type: z.enum(["desktop", "mobile", "tablet"]).optional(),
  os: z.string().max(32).optional(),
  browser: z.string().max(32).optional(),
  screen_w: z.number().int().nonnegative().max(20000).optional(),
  screen_h: z.number().int().nonnegative().max(20000).optional(),
  duration_ms: z.number().int().nonnegative().max(3_600_000).optional(),
  bytes: z.number().int().nonnegative().max(2_000_000_000).optional(),
  ok: z.boolean().optional(),
  error_code: z.string().max(64).optional(),
  ua_kind: z.enum(["likely_human", "needs_review", "suspicious"]).optional(),
  feature: z.string().max(64).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
});

const Payload = z.union([EventSchema, z.array(EventSchema).min(1).max(20)]);

export const Route = createFileRoute("/api/public/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        // 32 KB cap accommodates 20 events × ~1.5 KB (with metrics + integrity fields).
        const text = await request.text();
        if (text.length > 32_768) {
          return jsonFail("invalid_request", "Payload too large.", { status: 413, requestId });
        }
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return jsonFail("invalid_request", "Malformed JSON.", { status: 400, requestId });
        }
        const parsed = Payload.safeParse(raw);
        if (!parsed.success) {
          return jsonFail("invalid_request", "Invalid event payload.", {
            status: 400,
            requestId,
          });
        }
        const samples = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

        // Country derived from Cloudflare edge header. No IP is ever read.
        const country =
          request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = samples.map((s) => ({
          event_id: s.event_id ?? null,
          seq: s.seq ?? null,
          client_ts: s.client_ts ?? null,
          session_id: s.session_id,
          name: s.name,
          path: s.path ?? null,
          referrer_host: s.referrer_host ?? null,
          source: s.source ?? null,
          medium: s.medium ?? null,
          campaign: s.campaign ?? null,
          country,
          region: null,
          city: null,
          timezone: s.timezone ?? null,
          language: s.language ?? null,
          device_type: s.device_type ?? null,
          os: s.os ?? null,
          browser: s.browser ?? null,
          screen_w: s.screen_w ?? null,
          screen_h: s.screen_h ?? null,
          duration_ms: s.duration_ms ?? null,
          bytes: s.bytes ?? null,
          ok: s.ok ?? null,
          error_code: s.error_code ?? null,
          ua_kind: s.ua_kind ?? null,
          metrics: s.metrics ?? null,
        }));

        // Deduplicate via upsert on event_id. Rows with event_id=null
        // fall back to plain insert (legacy clients / server-side emits).
        const withId = rows.filter((r) => r.event_id);
        const withoutId = rows.filter((r) => !r.event_id);
        const acceptedIds: string[] = [];

        if (withId.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("events")
            // ignoreDuplicates: true → PostgREST returns nothing for existing
            // rows and inserts new ones. We report acceptance by echoing the
            // ids we know are now stored (either newly inserted or already
            // present from a prior beacon).
            .upsert(withId as unknown as never, {
              onConflict: "event_id",
              ignoreDuplicates: true,
            })
            .select("event_id");
          if (error) {
            return jsonFail("internal_error", "Ingestion failed.", { status: 500, requestId });
          }
          for (const row of data ?? []) {
            const id = (row as { event_id?: string | null }).event_id;
            if (id) acceptedIds.push(id);
          }
          // Even duplicates are "accepted" from the client's perspective — the
          // row is durably stored. Echo every submitted id.
          for (const r of withId) {
            const id = r.event_id as string;
            if (!acceptedIds.includes(id)) acceptedIds.push(id);
          }
        }

        if (withoutId.length > 0) {
          const { error } = await supabaseAdmin.from("events").insert(withoutId as unknown as never);
          if (error) {
            return jsonFail("internal_error", "Ingestion failed.", { status: 500, requestId });
          }
        }

        return jsonOk(
          { accepted: rows.length, accepted_ids: acceptedIds },
          { status: 202, requestId },
        );
      },
    },
  },
});
