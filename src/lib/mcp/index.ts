import { auth, defineMcp } from "@lovable.dev/mcp-js";

// The MCP surface was originally scoped to Visitor Intelligence tools. That
// feature has been removed because its data quality was unreliable, so we
// ship an empty tool set here. The MCP endpoint stays live so infrastructure
// (auth-generated routes, published manifest) keeps working, but no tools are
// exposed until a new, trustworthy surface is designed.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pixel-perfect-pro-mcp",
  title: "Pixel Perfect Pro",
  version: "1.0.0",
  instructions: "No tools are currently exposed.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [],
});
