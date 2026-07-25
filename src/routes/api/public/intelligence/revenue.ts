import { createFileRoute } from "@tanstack/react-router";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { requireAdmin } from "@/lib/intelligence/admin-gate.server";
import { aggregateRevenue } from "@/lib/intelligence/revenue/mrr";

export const Route = createFileRoute("/api/public/intelligence/revenue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const gate = await requireAdmin(request);
        if (!gate.ok) return jsonFail(gate.code, gate.message, { status: gate.status, requestId });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const revenue = await aggregateRevenue(supabaseAdmin);
          return jsonOk({ revenue }, { requestId });
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
