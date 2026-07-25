import { createFileRoute } from "@tanstack/react-router";
import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";
import { runEvolution } from "@/lib/evolution/engine";
import type { EvolutionInputs } from "@/lib/evolution/types";
import { requireAdmin } from "@/lib/intelligence/admin-gate.server";
import { aggregateConversion } from "@/lib/intelligence/conversion/funnel";
import { aggregateCapabilityValue } from "@/lib/intelligence/conversion/capability-value";
import { aggregateBrowserPerf } from "@/lib/intelligence/performance/by-browser";

// Recommendations engine — reads Task 9 aggregates + capability registry
// budgets and emits a ranked, deduped Recommendation[]. Never auto-applies.
export const Route = createFileRoute("/api/public/evolution/recommendations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const gate = await requireAdmin(request);
        if (!gate.ok) return jsonFail(gate.code, gate.message, { status: gate.status, requestId });
        try {
          const url = new URL(request.url);
          const hours = Math.max(1, Math.min(720, Math.floor(Number(url.searchParams.get("hours") ?? "168"))));
          const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
          const windowLabel = `${Math.round(hours / 24)}d`;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [conversion, capabilityUsage, browserPerf] = await Promise.all([
            aggregateConversion(supabaseAdmin, sinceIso),
            aggregateCapabilityValue(supabaseAdmin, sinceIso),
            aggregateBrowserPerf(supabaseAdmin, sinceIso),
          ]);

          const inputs: EvolutionInputs = {
            window: windowLabel,
            now: new Date().toISOString(),
            conversion,
            capabilityUsage,
            browserPerf,
          };
          const recommendations = runEvolution(inputs);
          return jsonOk(
            { window_hours: hours, since: sinceIso, recommendations, inputs },
            { requestId },
          );
        } catch {
          return jsonFail("internal_error", "Unexpected error.", { status: 500, requestId });
        }
      },
    },
  },
});
