import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult, requireAdmin } from "./_auth";

export default defineTool({
  name: "list_alerts",
  title: "List intelligence alerts",
  description:
    "Return active/recent intelligence alerts (traffic anomalies, risk spikes, source quality drops) for the last N days.",
  inputSchema: {
    days: z.number().int().min(1).max(30).default(7),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const auth = await requireAdmin(ctx);
    if (!auth.ok) return errorResult(auth.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, buildAlerts } = await import("../../intelligence.server");
    const rows = await fetchWindow(supabaseAdmin, days);
    const alerts = buildAlerts(rows, days);
    return jsonResult({ windowDays: days, alerts });
  },
});
