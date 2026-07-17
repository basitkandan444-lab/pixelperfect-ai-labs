import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { vitals, VITAL_NAMES } from "@/lib/vitals-store";

// Web Vitals ingestion + read-back. The browser beacons real field measurements
// here (POST); monitors and the command center read the aggregate (GET).
// PII-free by construction: only a metric name, a numeric value and an optional
// rating are accepted — no URLs, identifiers or user content.
//
// Stable URLs (immutable across renames):
//   https://project--34446754-4199-4528-b011-72bc3e10d075.lovable.app/api/public/vitals
//   https://project--34446754-4199-4528-b011-72bc3e10d075-dev.lovable.app/api/public/vitals

const SampleSchema = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().nonnegative().max(3_600_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
});

// Accept either a single sample or a small batch (sendBeacon flushes several).
const PayloadSchema = z.union([SampleSchema, z.array(SampleSchema).min(1).max(20)]);

export const Route = createFileRoute("/api/public/vitals")({
  server: {
    handlers: {
      GET: async () => jsonOk(vitals.snapshot()),

      POST: async ({ request }) => {
        const requestId = newRequestId();
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonFail("invalid_request", "Malformed JSON body.", { status: 400, requestId });
        }

        const parsed = PayloadSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonFail("invalid_request", "Invalid Web Vitals payload.", {
            status: 400,
            requestId,
          });
        }

        const samples = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
        for (const s of samples) vitals.record(s);

        // 202: accepted for aggregation, nothing to return.
        return jsonOk({ accepted: samples.length }, { status: 202, requestId });
      },
    },
  },
});
