// Enterprise Operations server functions: alert lifecycle + intelligence audit.
//
// Storage: reuses the existing `events` table so no new tables are required.
// Alert actions use name `alert_action`, session_id `ops:alerts`, and the
// action payload lives in `metrics jsonb`. Audit records use name
// `audit_record`, session_id `ops:audit-<sid>`. Reads use the admin client
// (server-only) after verifying the caller has the `admin` role.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });

const ActionSchema = z.object({
  alertId: z.string().min(1).max(64),
  type: z.enum(["acknowledge", "resolve", "mute", "unmute", "note", "tag", "untag"]),
  note: z.string().max(500).optional(),
  tag: z.string().max(40).optional(),
  mutedUntil: z.string().datetime().optional(),
  detection: z
    .object({
      severity: z.enum(["info", "warning", "critical"]),
      title: z.string(),
      detail: z.string(),
      detectedAt: z.string(),
    })
    .optional(),
});

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

async function fetchRawAlerts(days: number) {
  const { fetchWindow } = await import("./intelligence.server");
  const { buildAlerts } = await import("./intelligence.server");
  const sb = await admin();
  const rows = await fetchWindow(sb, days);
  return buildAlerts(rows, days);
}

// ---------- Alert lifecycle ----------

export const getAlertLifecycles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // Current raw detections stamped at "now".
    const raw = await fetchRawAlerts(data.days);
    const nowIso = new Date().toISOString();
    const { detectionsFromAlerts, buildAlertLifecycles } = await import("./alerts");
    const currentDets = detectionsFromAlerts(raw, nowIso);

    // Historical detections + actions from the events store.
    const { data: rows } = await sb
      .from("events")
      .select("name,ts,metrics")
      .in("name", ["alert_action", "alert_detection"])
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(10000);
    const actions: import("./alerts").AlertAction[] = [];
    const historicalDets: import("./alerts").AlertDetection[] = [];
    for (const r of rows ?? []) {
      const m = (r.metrics ?? {}) as Record<string, unknown>;
      if (r.name === "alert_action") {
        actions.push({
          id: String(m.id ?? `${r.ts}-${m.type}`),
          alertId: String(m.alertId ?? ""),
          type: m.type as import("./alerts").AlertActionType,
          at: String(m.at ?? r.ts),
          actor: String(m.actor ?? "unknown"),
          note: m.note ? String(m.note) : undefined,
          tag: m.tag ? String(m.tag) : undefined,
          mutedUntil: m.mutedUntil ? String(m.mutedUntil) : undefined,
        });
      } else if (r.name === "alert_detection") {
        historicalDets.push({
          id: String(m.id ?? ""),
          severity: (m.severity as "info" | "warning" | "critical") ?? "info",
          title: String(m.title ?? ""),
          detail: String(m.detail ?? ""),
          detectedAt: String(m.detectedAt ?? r.ts),
        });
      }
    }
    const lifecycles = buildAlertLifecycles({
      detections: [...historicalDets, ...currentDets],
      actions,
    });
    return { lifecycles, generatedAt: nowIso };
  });

export const recordAlertAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const at = new Date().toISOString();
    await sb.from("events").insert({
      session_id: "ops:alerts",
      name: "alert_action",
      metrics: {
        id: `${data.alertId}-${data.type}-${at}`,
        alertId: data.alertId,
        type: data.type,
        actor: context.userId,
        at,
        note: data.note,
        tag: data.tag,
        mutedUntil: data.mutedUntil,
      },
    });
    return { ok: true, at };
  });

/** Persist the current detection snapshot so history survives across days. */
export const snapshotAlertDetections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const raw = await fetchRawAlerts(data.days);
    const at = new Date().toISOString();
    const sb = await admin();
    if (raw.length) {
      await sb.from("events").insert(
        raw.map((a) => ({
          session_id: "ops:alerts",
          name: "alert_detection",
          metrics: { id: a.id, severity: a.severity, title: a.title, detail: a.detail, detectedAt: at },
        })),
      );
    }
    return { snapshotted: raw.length, at };
  });

// ---------- Intelligence audit log ----------

export const getAuditSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("metrics,ts")
      .eq("name", "audit_record")
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(20000);

    // Historical records read as-is (immutable) plus live classifications from
    // the current engine so a fresh install still shows current-version data.
    const { fetchWindow, buildIntelligence, groupSessions, classifySession } = await import(
      "./intelligence.server"
    );
    const { createAuditRecord, summarizeAuditLog, currentEngineVersion, attributionLine } =
      await import("./audit");
    const historical = (rows ?? [])
      .map((r) => r.metrics as unknown as import("./audit").AuditRecord)
      .filter((r) => r && r.version && r.sessionId);

    // Compose live audit records for still-live sessions.
    const events = await fetchWindow(sb, data.days);
    void buildIntelligence(events, data.days); // ensures deterministic types
    const sessions = groupSessions(events);
    const nowIso = new Date().toISOString();
    const live: import("./audit").AuditRecord[] = [];
    for (const s of sessions.values()) {
      const c = classifySession(s);
      live.push(createAuditRecord(c, nowIso));
    }
    const all = [...historical, ...live];
    return {
      summary: summarizeAuditLog(all),
      current: currentEngineVersion(),
      sampleAttribution: live[0] ? attributionLine(live[0]) : null,
      totalHistorical: historical.length,
      totalLive: live.length,
    };
  });

const SessionSchema = z.object({
  sessionId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(30),
});

export const getSessionAuditHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("metrics,ts")
      .eq("name", "audit_record")
      .eq("session_id", `ops:audit-${data.sessionId}`)
      .gte("ts", since)
      .order("ts", { ascending: true });
    const records = (rows ?? []).map((r) => r.metrics as unknown as import("./audit").AuditRecord);
    const { attributionLine } = await import("./audit");
    return {
      sessionId: data.sessionId,
      records,
      lines: records.map(attributionLine),
    };
  });

/** Record a single audit entry (used by client on classification-view). */
export const recordAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) => z.object({ sessionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { createAuditRecord } = await import("./audit");
    const rows = await fetchWindow(sb, 30);
    const s = groupSessions(rows).get(data.sessionId);
    if (!s) return { ok: false, error: "session-not-found" };
    const rec = createAuditRecord(classifySession(s));
    await sb.from("events").insert({
      session_id: `ops:audit-${data.sessionId}`,
      name: "audit_record",
      metrics: JSON.parse(JSON.stringify(rec)),
    });
    return { ok: true, record: rec };
  });
