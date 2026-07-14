import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult, requireAdmin } from "./_auth";

export default defineTool({
  name: "traffic_overview",
  title: "Traffic overview",
  description:
    "Summarise visitor intelligence for the last N days: totals, quality mix, top sources, and headline KPIs.",
  inputSchema: {
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe("Look-back window in days (1-90)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const auth = await requireAdmin(ctx);
    if (!auth.ok) return errorResult(auth.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, buildIntelligence } = await import("../../intelligence.server");
    const rows = await fetchWindow(supabaseAdmin, days);
    const intel = buildIntelligence(rows, days);
    return jsonResult({
      windowDays: days,
      overall: intel.overall,
      distribution: intel.distribution,
      segments: intel.segments,
      topReasons: intel.topReasons.slice(0, 10),
      insights: intel.insights,
    });
  },
});
