import { createFileRoute } from "@tanstack/react-router";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { requireAdmin } from "@/lib/intelligence/admin-gate.server";
import { aggregateBrowserPerf } from "@/lib/intelligence/performance/by-browser";

export const Route = createFileRoute("/api/public/intelligence/performance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const gate = await requireAdmin(request);
        if (!gate.ok) return jsonFail(gate.code, gate.message, { status: gate.status, requestId });
        try {
          const url = new URL(request.url);
          const hours = Math.max(
            1,
            Math.min(720, Math.floor(Number(url.searchParams.get("hours") ?? "168"))),
          );
          const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const byBrowser = await aggregateBrowserPerf(supabaseAdmin, sinceIso);
          return jsonOk({ window_hours: hours, since: sinceIso, byBrowser }, { requestId });
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
