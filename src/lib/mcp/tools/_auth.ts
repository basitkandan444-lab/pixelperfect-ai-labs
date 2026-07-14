// Shared admin-check helper for MCP tools. Every tool runs as the OAuth'd
// end user (ctx.getUserId() is auth.uid()); analytics data is admin-only,
// so we gate each tool on has_role(user, 'admin') before returning data.
import type { ToolContext } from "@lovable.dev/mcp-js";

export async function requireAdmin(ctx: ToolContext): Promise<
  | { ok: true; userId: string }
  | { ok: false; message: string }
> {
  if (!ctx.isAuthenticated()) return { ok: false, message: "Not authenticated." };
  const userId = ctx.getUserId();
  if (!userId) return { ok: false, message: "Missing user id." };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) return { ok: false, message: `Authorization check failed: ${error.message}` };
  if (!data) return { ok: false, message: "Admin role required." };
  return { ok: true, userId };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function jsonResult<T>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as unknown as Record<string, unknown>,
  };
}
