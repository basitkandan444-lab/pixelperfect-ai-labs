import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Aggregation queries powering the /admin Command Center. Every function
// verifies the caller is an admin, then reads via service role to bypass
// RLS on the `events` table (which is server-only by design).

const RangeSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
});

async function assertAdmin(supabase: ReturnType<typeof Object>, userId: string) {
  const supa = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data, error } = await supa.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------- Section 1: Traffic Overview ----------
export const getTrafficOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("session_id,name,duration_ms,ts")
      .gte("ts", since);
    const r = rows ?? [];
    const sessions = new Set(r.map((x) => x.session_id));
    const pv = r.filter((x) => x.name === "page_view").length;
    const enhancements = r.filter((x) => x.name === "enhance_completed").length;
    const downloads = r.filter((x) => x.name === "download_completed").length;
    // Session duration approximated as span between first/last event per session.
    const perSess: Record<string, { first: number; last: number; hits: number }> = {};
    for (const x of r) {
      const t = new Date(x.ts).getTime();
      const s = perSess[x.session_id] ?? (perSess[x.session_id] = { first: t, last: t, hits: 0 });
      s.first = Math.min(s.first, t);
      s.last = Math.max(s.last, t);
      s.hits += 1;
    }
    const durations = Object.values(perSess).map((s) => s.last - s.first);
    const avgDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const engaged = Object.values(perSess).filter(
      (s) => s.hits >= 2 || s.last - s.first > 10_000,
    ).length;
    return {
      users: sessions.size,
      sessions: sessions.size,
      pageviews: pv,
      events: r.length,
      enhancements,
      downloads,
      engagementRate: sessions.size ? engaged / sessions.size : 0,
      avgSessionMs: Math.round(avgDur),
      conversionRate: sessions.size ? downloads / sessions.size : 0,
    };
  });

// ---------- Section 2: Traffic Sources ----------
export const getTrafficSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("session_id,source,device_type,name")
      .gte("ts", since);
    const r = rows ?? [];
    const buckets: Record<
      string,
      { sessions: Set<string>; enhanced: number; devices: Record<string, number> }
    > = {};
    for (const x of r) {
      const s = x.source ?? "unknown";
      const b = buckets[s] ?? (buckets[s] = { sessions: new Set(), enhanced: 0, devices: {} });
      b.sessions.add(x.session_id);
      if (x.name === "enhance_completed") b.enhanced += 1;
      const d = x.device_type ?? "other";
      b.devices[d] = (b.devices[d] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .map(([source, b]) => ({
        source,
        users: b.sessions.size,
        enhanced: b.enhanced,
        conversionRate: b.sessions.size ? b.enhanced / b.sessions.size : 0,
        devices: b.devices,
      }))
      .sort((a, b) => b.users - a.users);
  });

// ---------- Section 3: Geography ----------
export const getGeoBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("country,timezone,language,session_id")
      .gte("ts", since);
    const r = rows ?? [];
    const byCountry: Record<string, Set<string>> = {};
    const byTz: Record<string, number> = {};
    const byLang: Record<string, number> = {};
    for (const x of r) {
      const c = x.country ?? "??";
      (byCountry[c] ?? (byCountry[c] = new Set())).add(x.session_id);
      if (x.timezone) byTz[x.timezone] = (byTz[x.timezone] ?? 0) + 1;
      if (x.language) byLang[x.language] = (byLang[x.language] ?? 0) + 1;
    }
    return {
      countries: Object.entries(byCountry)
        .map(([code, s]) => ({ code, users: s.size }))
        .sort((a, b) => b.users - a.users)
        .slice(0, 50),
      timezones: Object.entries(byTz)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20),
      languages: Object.entries(byLang)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20),
    };
  });

// ---------- Section 4: Device ----------
export const getDeviceBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("device_type,os,browser,session_id")
      .gte("ts", since);
    const r = rows ?? [];
    const count = (k: keyof (typeof r)[number]) => {
      const map: Record<string, Set<string>> = {};
      for (const x of r) {
        const v = (x[k] as string) ?? "unknown";
        (map[v] ?? (map[v] = new Set())).add(x.session_id);
      }
      return Object.entries(map)
        .map(([k, s]) => ({ label: k, users: s.size }))
        .sort((a, b) => b.users - a.users);
    };
    return { device_type: count("device_type"), os: count("os"), browser: count("browser") };
  });

// ---------- Section 6+8: Quality + Funnel ----------
export const getQualityAndFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("session_id,name,ua_kind,ts")
      .gte("ts", since);
    const r = rows ?? [];

    // Quality
    const sessionKind: Record<string, string> = {};
    const sessionEvents: Record<string, string[]> = {};
    const sessionSpan: Record<string, { first: number; last: number }> = {};
    for (const x of r) {
      if (x.ua_kind && !sessionKind[x.session_id]) sessionKind[x.session_id] = x.ua_kind;
      (sessionEvents[x.session_id] ??= []).push(x.name);
      const t = new Date(x.ts).getTime();
      const s = sessionSpan[x.session_id] ?? (sessionSpan[x.session_id] = { first: t, last: t });
      s.first = Math.min(s.first, t);
      s.last = Math.max(s.last, t);
    }
    let human = 0,
      review = 0,
      suspicious = 0;
    for (const sid of Object.keys(sessionEvents)) {
      const kind = sessionKind[sid];
      const evs = sessionEvents[sid];
      const dur = sessionSpan[sid].last - sessionSpan[sid].first;
      const engaged = evs.length >= 2 && dur > 5_000;
      const meaningful = evs.some(
        (n) => n === "upload_started" || n === "enhance_completed" || n === "download_completed",
      );
      const veryFast = evs.length > 5 && dur < 1_000;
      if (kind === "suspicious" || veryFast) suspicious++;
      else if (kind === "needs_review" || (!engaged && !meaningful)) review++;
      else human++;
    }

    // Funnel
    const uploads = new Set<string>();
    const started = new Set<string>();
    const completed = new Set<string>();
    const downloaded = new Set<string>();
    const visited = new Set<string>();
    for (const x of r) {
      visited.add(x.session_id);
      if (x.name === "upload_completed") uploads.add(x.session_id);
      if (x.name === "enhance_started") started.add(x.session_id);
      if (x.name === "enhance_completed") completed.add(x.session_id);
      if (x.name === "download_completed") downloaded.add(x.session_id);
    }

    return {
      quality: { human, review, suspicious, total: human + review + suspicious },
      funnel: {
        visited: visited.size,
        uploaded: uploads.size,
        enhanceStarted: started.size,
        enhanceCompleted: completed.size,
        downloaded: downloaded.size,
      },
    };
  });

// ---------- Section 9: Real-time (last 5 min) ----------
export const getRealtime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("session_id,name,path,country,device_type,ts")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(200);
    const r = rows ?? [];
    const active = new Set(r.map((x) => x.session_id));
    const byPath: Record<string, number> = {};
    for (const x of r) if (x.path) byPath[x.path] = (byPath[x.path] ?? 0) + 1;
    return {
      active: active.size,
      recent: r.slice(0, 20),
      topPaths: Object.entries(byPath)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    };
  });

// ---------- Section 7: Journeys ----------
export const getJourneys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("session_id,name,path,ts")
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(5000);
    const r = rows ?? [];
    const sessions: Record<string, { landing?: string; steps: string[]; exit?: string }> = {};
    for (const x of r) {
      const s = sessions[x.session_id] ?? (sessions[x.session_id] = { steps: [] });
      if (!s.landing && x.path) s.landing = x.path;
      s.steps.push(x.name);
      if (x.path) s.exit = x.path;
    }
    // Top journey signatures
    const sigs: Record<string, number> = {};
    for (const s of Object.values(sessions)) {
      const sig = Array.from(new Set(s.steps)).slice(0, 6).join(" → ");
      sigs[sig] = (sigs[sig] ?? 0) + 1;
    }
    return Object.entries(sigs)
      .map(([sig, n]) => ({ signature: sig, sessions: n }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20);
  });

// ---------- CSV export ----------
export const exportEventsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select(
        "ts,name,path,source,country,device_type,os,browser,ua_kind,duration_ms,ok,error_code",
      )
      .gte("ts", since)
      .limit(50000);
    const header =
      "ts,name,path,source,country,device_type,os,browser,ua_kind,duration_ms,ok,error_code";
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (rows ?? [])
      .map((r) =>
        [
          r.ts,
          r.name,
          r.path,
          r.source,
          r.country,
          r.device_type,
          r.os,
          r.browser,
          r.ua_kind,
          r.duration_ms,
          r.ok,
          r.error_code,
        ]
          .map(esc)
          .join(","),
      )
      .join("\n");
    return { csv: `${header}\n${body}` };
  });
