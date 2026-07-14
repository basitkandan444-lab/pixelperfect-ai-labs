import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });
const VisitorSchema = RangeSchema.extend({ limit: z.number().int().min(1).max(100).default(25) });
const RealtimeSchema = z.object({ windowSeconds: z.number().int().min(30).max(3600).default(300) });

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

async function fetchAndBuild(days: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchWindow } = await import("./intelligence.server");
  return { rows: await fetchWindow(supabaseAdmin, days) };
}

export const getIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { rows } = await fetchAndBuild(data.days);
    const { buildIntelligence } = await import("./intelligence.server");
    return buildIntelligence(rows, data.days);
  });

export const getVisitorTimelines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; limit?: number }) => VisitorSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { rows } = await fetchAndBuild(data.days);
    const { buildVisitorTimelines } = await import("./intelligence.server");
    return buildVisitorTimelines(rows, data.limit);
  });

export const getSourceIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { rows } = await fetchAndBuild(data.days);
    const { buildSourceIntelligence } = await import("./intelligence.server");
    return buildSourceIntelligence(rows);
  });

export const getRealtimeIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { windowSeconds?: number }) => RealtimeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Fetch just the recent slice for real-time.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.windowSeconds * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("events")
      .select(
        "session_id,name,path,source,medium,device_type,os,browser,ua_kind,country,ts,duration_ms,ok",
      )
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(5000);
    const { buildRealtimeIntelligence } = await import("./intelligence.server");
    return buildRealtimeIntelligence((rows ?? []) as never, data.windowSeconds);
  });

export const getIntelligenceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { rows } = await fetchAndBuild(data.days);
    const { buildTextReport } = await import("./intelligence.server");
    return { report: buildTextReport(rows, data.days) };
  });
