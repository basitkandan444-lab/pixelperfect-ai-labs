import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";

// Privacy-preserving event ingestion. No PII: we do NOT store IP, user-agent
// strings, or user IDs. Only the classified/derived fields the client sent.
//
// This endpoint is public by design (browsers post here). It is size-capped
// and validates every field to keep the store clean and bounded.

const EVENT_NAMES = [
  "page_view",
  "upload_started",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "download_completed",
  "error",
  "feature_interaction",
] as const;

const EventSchema = z.object({
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
});

const Payload = z.union([EventSchema, z.array(EventSchema).min(1).max(20)]);

export const Route = createFileRoute("/api/public/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        // Cap body size: 10 KB is more than enough for 20 events × ~500 bytes.
        const text = await request.text();
        if (text.length > 10_240) {
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

        // Country derived from Cloudflare edge header (workerd sets CF-IPCountry).
        // No IP is ever read or stored.
        const country =
          request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = samples.map((s) => ({
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
        }));

        const { error } = await supabaseAdmin.from("events").insert(rows);
        if (error) {
          return jsonFail("internal_error", "Ingestion failed.", { status: 500, requestId });
        }
        return jsonOk({ accepted: rows.length }, { status: 202, requestId });
      },
    },
  },
});
