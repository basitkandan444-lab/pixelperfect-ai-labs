// Server-only intelligence computations. Aggregates the events store into
// quality scores, human/automation probabilities, product segments, retention
// proxies, and auto-generated insights. No PII; no per-visitor identity.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventRow {
  session_id: string;
  name: string;
  path: string | null;
  source: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  ua_kind: string | null;
  country: string | null;
  ts: string;
  duration_ms: number | null;
  ok: boolean | null;
}

export async function fetchWindow(sb: SupabaseClient, days: number): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb
    .from("events")
    .select(
      "session_id,name,path,source,device_type,os,browser,ua_kind,country,ts,duration_ms,ok",
    )
    .gte("ts", since)
    .order("ts", { ascending: true })
    .limit(20000);
  return (data ?? []) as EventRow[];
}

interface SessionAgg {
  events: EventRow[];
  first: number;
  last: number;
  paths: Set<string>;
  names: Set<string>;
  ua_kind: string | null;
  source: string | null;
  device: string | null;
  errors: number;
}

function groupSessions(rows: EventRow[]): Map<string, SessionAgg> {
  const m = new Map<string, SessionAgg>();
  for (const r of rows) {
    const t = new Date(r.ts).getTime();
    let s = m.get(r.session_id);
    if (!s) {
      s = {
        events: [],
        first: t,
        last: t,
        paths: new Set(),
        names: new Set(),
        ua_kind: r.ua_kind,
        source: r.source,
        device: r.device_type,
        errors: 0,
      };
      m.set(r.session_id, s);
    }
    s.events.push(r);
    s.first = Math.min(s.first, t);
    s.last = Math.max(s.last, t);
    if (r.path) s.paths.add(r.path);
    s.names.add(r.name);
    if (r.name === "error" || r.ok === false) s.errors += 1;
    if (!s.ua_kind && r.ua_kind) s.ua_kind = r.ua_kind;
    if (!s.source && r.source) s.source = r.source;
    if (!s.device && r.device_type) s.device = r.device_type;
  }
  return m;
}

/** Score a single session on privacy-safe behavioural signals. 0–100. */
function scoreSession(s: SessionAgg): { score: number; reasons: string[] } {
  const dur = s.last - s.first;
  const evts = s.events.length;
  const reasons: string[] = [];
  let score = 50;

  if (s.ua_kind === "likely_human") {
    score += 10;
    reasons.push("Natural UA signals");
  } else if (s.ua_kind === "suspicious") {
    score -= 40;
    reasons.push("Bot-like UA");
  } else if (s.ua_kind === "needs_review") {
    score -= 10;
  }

  if (dur > 15_000) {
    score += 10;
    reasons.push("Sustained session");
  }
  if (dur > 0 && dur < 800 && evts > 4) {
    score -= 25;
    reasons.push("Machine-fast interactions");
  }

  if (s.paths.size >= 2) {
    score += 5;
    reasons.push("Multi-page navigation");
  }

  if (s.names.has("upload_started") || s.names.has("upload_completed")) {
    score += 8;
    reasons.push("Started product workflow");
  }
  if (s.names.has("enhance_completed")) {
    score += 12;
    reasons.push("Completed enhancement");
  }
  if (s.names.has("download_completed")) {
    score += 10;
    reasons.push("Downloaded result");
  }

  if (s.errors > 3) {
    score -= 10;
    reasons.push("Repeated errors");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function classify(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function segment(s: SessionAgg): string {
  const n = s.names;
  if (n.has("download_completed") && s.events.length > 12) return "Power User";
  if (n.has("enhance_completed")) return "Activated";
  if (n.has("upload_started") && !n.has("enhance_completed")) return "Failed";
  if (s.paths.size >= 3 && !n.has("upload_started")) return "High Intent";
  return "Explorer";
}

export interface IntelligenceReport {
  window_days: number;
  overall: {
    score: number;
    classification: "high" | "medium" | "low";
    humanPct: number;
    automationPct: number;
    sessions: number;
  };
  distribution: { high: number; medium: number; low: number };
  segments: Record<string, number>;
  topReasons: { reason: string; count: number }[];
  retention: {
    supported: boolean;
    note: string;
    d1?: number;
    d7?: number;
    d30?: number;
  };
  insights: string[];
}

export function buildIntelligence(rows: EventRow[], days: number): IntelligenceReport {
  const sessions = groupSessions(rows);
  const total = sessions.size;
  let sum = 0;
  let human = 0;
  const dist = { high: 0, medium: 0, low: 0 };
  const segs: Record<string, number> = {};
  const reasonTally: Record<string, number> = {};

  for (const s of sessions.values()) {
    const { score, reasons } = scoreSession(s);
    sum += score;
    dist[classify(score)] += 1;
    if (score >= 60 && s.ua_kind !== "suspicious") human += 1;
    const seg = segment(s);
    segs[seg] = (segs[seg] ?? 0) + 1;
    for (const r of reasons) reasonTally[r] = (reasonTally[r] ?? 0) + 1;
  }

  const avg = total ? sum / total : 0;
  const humanPct = total ? human / total : 0;

  // Auto insights — deterministic, data-derived summaries.
  const insights: string[] = [];
  if (total === 0) {
    insights.push("No sessions in the selected window. Insights unlock as traffic arrives.");
  } else {
    const activated = segs["Activated"] ?? 0;
    const failed = segs["Failed"] ?? 0;
    const explorers = segs["Explorer"] ?? 0;
    if (failed > activated && failed > 2)
      insights.push(
        `${failed} sessions started an upload but never completed enhancement. Investigate upload → enhance drop-off.`,
      );
    if (explorers / total > 0.6)
      insights.push(
        `${((explorers / total) * 100).toFixed(0)}% of sessions never reached the product. The landing page may not be converting attention into intent.`,
      );
    if (dist.low / total > 0.3)
      insights.push(
        `${((dist.low / total) * 100).toFixed(0)}% of sessions scored low quality — traffic may include automation or bounces.`,
      );
    if (activated > 0 && activated / total < 0.05)
      insights.push(
        "Activation rate is below 5%. Consider a stronger call-to-action or reducing steps before first enhancement.",
      );
    if (humanPct > 0.9)
      insights.push(
        `${(humanPct * 100).toFixed(0)}% of sessions look human — traffic quality is strong.`,
      );

    // Device split insight
    const deviceCount: Record<string, number> = {};
    const deviceConv: Record<string, number> = {};
    for (const s of sessions.values()) {
      const d = s.device ?? "unknown";
      deviceCount[d] = (deviceCount[d] ?? 0) + 1;
      if (s.names.has("enhance_completed")) deviceConv[d] = (deviceConv[d] ?? 0) + 1;
    }
    const desktopConv = (deviceConv["desktop"] ?? 0) / Math.max(1, deviceCount["desktop"] ?? 0);
    const mobileConv = (deviceConv["mobile"] ?? 0) / Math.max(1, deviceCount["mobile"] ?? 0);
    if (deviceCount["desktop"] && deviceCount["mobile"] && desktopConv > mobileConv * 1.5) {
      insights.push(
        `Desktop converts ${(desktopConv * 100).toFixed(0)}% vs mobile ${(mobileConv * 100).toFixed(0)}%. Mobile UX may need attention.`,
      );
    }
  }

  const topReasons = Object.entries(reasonTally)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    window_days: days,
    overall: {
      score: Math.round(avg),
      classification: classify(avg),
      humanPct,
      automationPct: 1 - humanPct,
      sessions: total,
    },
    distribution: dist,
    segments: segs,
    topReasons,
    retention: {
      supported: false,
      note: "Retention requires a stable visitor identity. Session IDs are per-tab and non-persistent by privacy design, so cross-day retention cannot be computed without additional consent-based identification.",
    },
    insights,
  };
}
