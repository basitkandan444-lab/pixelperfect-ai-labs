import { createFileRoute } from "@tanstack/react-router";

import { jsonFail, jsonOk } from "@/lib/api-response";
import { newRequestId } from "@/lib/logger";

// Public read-back of persisted reliability alerts. PII-free by construction:
// alerts are aggregated numeric evidence, never user data.

export const Route = createFileRoute("/api/public/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const windowHours = Math.min(
          168,
          Math.max(1, Number(url.searchParams.get("windowHours") ?? 24)),
        );
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
          const { data, error } = await supabaseAdmin
            .from("reliability_alerts")
            .select(
              "id,ts,kind,severity,title,detail,recommendation,evidence,delivered_at,delivery_status,delivery_error",
            )
            .gte("ts", since)
            .order("ts", { ascending: false })
            .limit(200);
          if (error) throw error;
          return jsonOk(
            {
              windowHours,
              count: data?.length ?? 0,
              alerts: data ?? [],
            },
            { requestId },
          );
        } catch (err) {
          return jsonFail("internal_error", err instanceof Error ? err.message : "Failed", {
            status: 500,
            requestId,
          });
        }
      },
    },
  },
});
