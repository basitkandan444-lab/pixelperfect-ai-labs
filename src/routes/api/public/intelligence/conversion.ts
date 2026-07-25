import { createFileRoute } from "@tanstack/react-router";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { requireAdmin } from "@/lib/intelligence/admin-gate.server";
import { aggregateConversion } from "@/lib/intelligence/conversion/funnel";
import { aggregateCapabilityValue } from "@/lib/intelligence/conversion/capability-value";

function windowFrom(req: Request) {
  const url = new URL(req.url);
  const hours = Math.max(1, Math.min(720, Math.floor(Number(url.searchParams.get("hours") ?? "168"))));
  return { hours, sinceIso: new Date(Date.now() - hours * 3600_000).toISOString() };
}

export const Route = createFileRoute("/api/public/intelligence/conversion")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const gate = await requireAdmin(request);
        if (!gate.ok) return jsonFail(gate.code, gate.message, { status: gate.status, requestId });
        try {
          const { hours, sinceIso } = windowFrom(request);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [conversion, capabilities] = await Promise.all([
            aggregateConversion(supabaseAdmin, sinceIso),
            aggregateCapabilityValue(supabaseAdmin, sinceIso),
          ]);
          return jsonOk({ window_hours: hours, since: sinceIso, conversion, capabilities }, { requestId });
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
