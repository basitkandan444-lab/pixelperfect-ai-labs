import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Google Search Console via the Lovable connector gateway. Auth-gated to admins.
// All process.env reads and gateway fetches live in ./gsc.server (server-only)
// per the createServerFn splitting rules.

async function assertAdmin(supabase: unknown, userId: string) {
  const s = supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data, error } = await s.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export type { GscSite, GscRow, GscTotals } from "./gsc.server";

export const listGscSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { fetchGscSites } = await import("./gsc.server");
    return fetchGscSites();
  });

export const getGscPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { siteUrl: string; days?: number }) => ({
    siteUrl: String(d.siteUrl),
    days: Math.min(90, Math.max(1, Number(d.days ?? 28))),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { fetchGscPerformance } = await import("./gsc.server");
    return fetchGscPerformance(data.siteUrl, data.days);
  });
