import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Google Search Console via the Lovable connector gateway. Auth-gated to admins.

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

async function assertAdmin(supabase: unknown, userId: string) {
  const s = supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data, error } = await s.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
    "X-Connection-Api-Key": process.env.GOOGLE_SEARCH_CONSOLE_API_KEY!,
    "Content-Type": "application/json",
  };
}

export const listGscSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!process.env.GOOGLE_SEARCH_CONSOLE_API_KEY) return { sites: [], connected: false };
    const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
    if (!res.ok) return { sites: [], connected: false, error: `${res.status}` };
    const j = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> };
    return { sites: j.siteEntry ?? [], connected: true };
  });

export const getGscPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { siteUrl: string; days?: number }) => ({
    siteUrl: String(d.siteUrl),
    days: Math.min(90, Math.max(1, Number(d.days ?? 28))),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!process.env.GOOGLE_SEARCH_CONSOLE_API_KEY) return null;
    const end = new Date();
    const start = new Date(end.getTime() - data.days * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const path = `/webmasters/v3/sites/${encodeURIComponent(data.siteUrl)}/searchAnalytics/query`;
    const call = async (dim: string[]) => {
      const res = await fetch(`${GATEWAY}${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          startDate: iso(start),
          endDate: iso(end),
          dimensions: dim,
          rowLimit: 50,
        }),
      });
      if (!res.ok) return { rows: [] as unknown[] };
      return (await res.json()) as { rows?: unknown[] };
    };
    const [totals, byQuery, byPage] = await Promise.all([call([]), call(["query"]), call(["page"])]);
    return { totals: totals.rows?.[0] ?? null, byQuery: byQuery.rows ?? [], byPage: byPage.rows ?? [] };
  });
