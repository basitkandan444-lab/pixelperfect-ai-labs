import { auth, defineMcp } from "@lovable.dev/mcp-js";

import alertsTool from "./tools/alerts";
import realtimeTool from "./tools/realtime";
import topSourcesTool from "./tools/top-sources";
import trafficOverviewTool from "./tools/traffic-overview";

// The OAuth issuer MUST be the direct Supabase host — SUPABASE_URL is rewritten
// to the .lovable.cloud proxy on publish and mcp-js rejects that. The project
// ref survives publish and is inlined by Vite at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pixel-perfect-pro-mcp",
  title: "Pixel Perfect Pro — Visitor Intelligence",
  version: "1.0.0",
  instructions:
    "Read-only access to Pixel Perfect Pro's visitor intelligence command center. Use `traffic_overview` for headline KPIs, `top_sources` for source-quality analysis, `realtime_visitors` for a live snapshot, and `list_alerts` to review anomaly alerts. All tools require an admin account of the connected app.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [trafficOverviewTool, topSourcesTool, realtimeTool, alertsTool],
});
