// Loop 4 — Version Intelligence server functions. All admin-gated,
// read-only over the immutable `sandbox_simulation` event stream. No
// production classifications, rules, weights, or alerts are ever mutated.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const WindowSchema = z.object({ days: z.number().int().min(1).max(365).default(90) });

async function loadEntries(days: number) {
  const sb = await admin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb
    .from("events")
    .select("metrics,ts")
    .eq("name", "sandbox_simulation")
    .gte("ts", since)
    .order("ts", { ascending: true })
    .limit(500);
  const entries = (data ?? []).map((r) => ({
    ts: r.ts,
    ...(r.metrics as Record<string, unknown>),
  }));
  // Coerce shape — see version-intel/compute.ts SimulationEntry.
  return entries as unknown as import("./version-intel/compute").SimulationEntry[];
}

export const getVersionSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => WindowSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { versionSnapshots } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    return { snapshots: versionSnapshots(entries), total: entries.length };
  });

const DiffSchema = z.object({
  days: z.number().int().min(1).max(365).default(90),
  baseline: z.string().min(1),
  candidate: z.string().min(1),
});

export const getVersionDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DiffSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { versionSnapshots, compareVersions } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    const snaps = versionSnapshots(entries);
    const baseline = snaps.find((s) => s.engineVersion === data.baseline);
    const candidate = snaps.find((s) => s.engineVersion === data.candidate);
    if (!baseline || !candidate) return { diff: null };
    return { diff: compareVersions(baseline, candidate) };
  });

export const getRuleImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => WindowSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { ruleImpactRows } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    return { rows: ruleImpactRows(entries) };
  });

export const getVersionTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => WindowSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { buildTimeline } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    return { timeline: buildTimeline(entries) };
  });

export const getOperationalMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => WindowSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { operationalMetrics } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    return { metrics: operationalMetrics(entries) };
  });

const LeaderboardSchema = z.object({
  days: z.number().int().min(1).max(365).default(90),
  page: z.number().int().min(1).max(200).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  q: z.string().max(200).optional(),
  engineVersion: z.string().optional(),
  status: z.string().optional(),
  sort: z
    .enum(["ts", "quality", "human", "confidence", "duration"])
    .default("ts"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const listSimulations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeaderboardSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { toLeaderboardRows } = await import("./version-intel/compute");
    const entries = await loadEntries(data.days);
    let rows = toLeaderboardRows(entries);
    if (data.q) {
      const q = data.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.simulationId.toLowerCase().includes(q) ||
          r.engineVersion.toLowerCase().includes(q) ||
          r.ruleVersion.toLowerCase().includes(q),
      );
    }
    if (data.engineVersion) rows = rows.filter((r) => r.engineVersion === data.engineVersion);
    if (data.status) rows = rows.filter((r) => r.status === data.status);
    const dir = data.order === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (data.sort) {
        case "quality":
          return (a.avgQuality - b.avgQuality) * dir;
        case "human":
          return (a.humanPct - b.humanPct) * dir;
        case "confidence":
          return (a.avgConfidence - b.avgConfidence) * dir;
        case "duration":
          return (a.durationMs - b.durationMs) * dir;
        default:
          return a.ts.localeCompare(b.ts) * dir;
      }
    });
    const total = rows.length;
    const start = (data.page - 1) * data.pageSize;
    const paged = rows.slice(start, start + data.pageSize);
    return { rows: paged, total, page: data.page, pageSize: data.pageSize };
  });

export const getSimulationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { simulationId: string }) =>
    z.object({ simulationId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { assessPromotion } = await import("./version-intel/compute");
    const sb = await admin();
    const { data: rows } = await sb
      .from("events")
      .select("metrics,ts")
      .eq("name", "sandbox_simulation")
      .order("ts", { ascending: false })
      .limit(500);
    const entries = (rows ?? []).map((r) => ({
      ts: r.ts,
      ...(r.metrics as Record<string, unknown>),
    })) as unknown as import("./version-intel/compute").SimulationEntry[];
    const entry = entries.find((e) => e.simulationId === data.simulationId);
    if (!entry) return { entry: null };
    return { entry, assessment: assessPromotion(entry) };
  });
