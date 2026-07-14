import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult, requireAdmin } from "./_auth";

export default defineTool({
  name: "realtime_visitors",
  title: "Realtime visitors",
  description:
    "Live snapshot of active sessions and recent activity within a rolling time window.",
  inputSchema: {
    windowSeconds: z
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(300)
      .describe("Rolling window in seconds (30-3600)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ windowSeconds }, ctx) => {
    const auth = await requireAdmin(ctx);
    if (!auth.ok) return errorResult(auth.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, buildRealtime } = await import("../../intelligence.server");
    const rows = await fetchWindow(supabaseAdmin, 1);
    const realtime = buildRealtime(rows, windowSeconds);
    return jsonResult(realtime);
  },
});
