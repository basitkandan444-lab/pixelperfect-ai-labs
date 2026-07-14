import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult, requireAdmin } from "./_auth";

export default defineTool({
  name: "top_sources",
  title: "Top traffic sources",
  description:
    "Rank traffic sources by session volume and quality for the last N days.",
  inputSchema: {
    days: z.number().int().min(1).max(90).default(7),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const auth = await requireAdmin(ctx);
    if (!auth.ok) return errorResult(auth.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, buildSourceIntelligence } = await import(
      "../../intelligence.server"
    );
    const rows = await fetchWindow(supabaseAdmin, days);
    const sources = buildSourceIntelligence(rows);
    return jsonResult({ windowDays: days, sources });
  },
});
