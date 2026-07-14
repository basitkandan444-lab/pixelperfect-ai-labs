// Server-only intelligence computations. Aggregates the events store into
// per-session probability scores, evidence trails, source-level quality,
// segmentation, and auto-generated insights. Privacy-preserving: no PII,
// no persistent identity — session ids are per-tab and non-linkable.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventRow {
  session_id: string;
  name: string;
  path: string | null;
  source: string | null;
  medium: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  ua_kind: string | null;
  country: string | null;
  ts: string;
  duration_ms: number | null;
  ok: boolean | null;
  metrics?: Record<string, unknown> | null;
}

export async function fetchWindow(sb: SupabaseClient, days: number): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb
    .from("events")
    .select(
      "session_id,name,path,source,medium,device_type,os,browser,ua_kind,country,ts,duration_ms,ok,metrics",
    )
    .gte("ts", since)
    .order("ts", { ascending: true })
    .limit(20000);
  return (data ?? []) as EventRow[];
}

// ---------- Session aggregation ----------

export interface SessionAgg {
  session_id: string;
  events: EventRow[];
  first: number;
  last: number;
  paths: Set<string>;
  names: Set<string>;
  ua_kind: string | null;
  source: string | null;
  medium: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  country: string | null;
  errors: number;
  intervals: number[];
  summary: Record<string, unknown> | null; // last session_summary metrics
  rageClicks: number;
  deadClicks: number;
}

export function groupSessions(rows: EventRow[]): Map<string, SessionAgg> {
  const m = new Map<string, SessionAgg>();
  for (const r of rows) {
    const t = new Date(r.ts).getTime();
    let s = m.get(r.session_id);
    if (!s) {
      s = {
        session_id: r.session_id,
        events: [],
        first: t,
        last: t,
        paths: new Set(),
        names: new Set(),
        ua_kind: r.ua_kind,
        source: r.source,
        medium: r.medium,
        device: r.device_type,
        os: r.os,
        browser: r.browser,
        country: r.country,
        errors: 0,
        intervals: [],
        summary: null,
        rageClicks: 0,
        deadClicks: 0,
      };
      m.set(r.session_id, s);
    }
    if (s.events.length > 0) {
      const prev = new Date(s.events[s.events.length - 1].ts).getTime();
      s.intervals.push(Math.max(0, t - prev));
    }
    s.events.push(r);
    s.first = Math.min(s.first, t);
    s.last = Math.max(s.last, t);
    if (r.path) s.paths.add(r.path);
    s.names.add(r.name);
    if (r.name === "error" || r.ok === false) s.errors += 1;
    if (r.name === "session_summary" && r.metrics && typeof r.metrics === "object")
      s.summary = r.metrics;
    if (r.name === "feature_interaction" && r.metrics) {
      const feat = (r.metrics as { feature?: string }).feature;
      // The feature name is also placed on the row via track(); but fall through
      // by inspecting metrics.element / feature stored downstream.
      if (feat === "rage_click") s.rageClicks += 1;
      if (feat === "dead_click") s.deadClicks += 1;
    }
    if (!s.ua_kind && r.ua_kind) s.ua_kind = r.ua_kind;
    if (!s.source && r.source) s.source = r.source;
    if (!s.device && r.device_type) s.device = r.device_type;
    if (!s.country && r.country) s.country = r.country;
  }
  return m;
}

// ---------- Timing intelligence ----------

function stats(xs: number[]): { mean: number; std: number; cv: number } {
  if (xs.length === 0) return { mean: 0, std: 0, cv: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const std = Math.sqrt(variance);
  return { mean, std, cv: mean > 0 ? std / mean : 0 };
}

// ---------- Per-session classification ----------

export type Confidence = "high" | "medium" | "low";
export type Segment =
  | "Explorer"
  | "Interested"
  | "Activated"
  | "Power User"
  | "High Intent"
  | "Failed"
  | "Suspicious"
  | "Low Quality";

export interface SessionClassification {
  session_id: string;
  humanProbability: number; // 0..1
  automationProbability: number; // 0..1
  qualityScore: number; // 0..100
  confidence: Confidence;
  segment: Segment;
  intentScore: number; // 0..100
  engagementScore: number; // 0..100
  riskLevel: "low" | "medium" | "high";
  evidence: { signal: string; direction: "positive" | "negative"; weight: number }[];
  reasons: string[];
  device: string | null;
  source: string | null;
  country: string | null;
  duration_ms: number;
  events: number;
  first: string;
  last: string;
  summary: Record<string, number | string | boolean | null> | null;
  rageClicks: number;
  deadClicks: number;
}

// Bounded-add helper. Every signal contributes a capped weight so a single
// noisy signal cannot dominate the multi-signal score.
function addEv(
  ev: SessionClassification["evidence"],
  signal: string,
  direction: "positive" | "negative",
  weight: number,
) {
  ev.push({ signal, direction, weight: Math.min(weight, 25) });
}

export function classifySession(s: SessionAgg): SessionClassification {
  const dur = s.last - s.first;
  const n = s.events.length;
  const ev: SessionClassification["evidence"] = [];
  let score = 50;
  const push = (sig: string, dir: "positive" | "negative", w: number) => {
    addEv(ev, sig, dir, w);
    score += dir === "positive" ? Math.min(w, 25) : -Math.min(w, 25);
  };

  // UA signal
  if (s.ua_kind === "likely_human") {
    score += 10;
    ev.push({ signal: "Natural browser fingerprint", direction: "positive", weight: 10 });
  } else if (s.ua_kind === "suspicious") {
    score -= 45;
    ev.push({ signal: "Bot-like user-agent", direction: "negative", weight: 45 });
  } else if (s.ua_kind === "needs_review") {
    score -= 8;
    ev.push({ signal: "Incomplete browser signals", direction: "negative", weight: 8 });
  }

  // Session shape
  if (dur > 20_000) {
    score += 10;
    ev.push({ signal: "Sustained session (>20s)", direction: "positive", weight: 10 });
  }
  if (dur > 0 && dur < 800 && n > 4) {
    score -= 25;
    ev.push({ signal: "Machine-fast interactions", direction: "negative", weight: 25 });
  }
  if (n > 20 && s.paths.size <= 1) {
    score -= 10;
    ev.push({ signal: "High activity, zero navigation", direction: "negative", weight: 10 });
  }

  // Timing rhythm — humans are irregular, scripts are regular.
  if (s.intervals.length >= 4) {
    const { mean, cv } = stats(s.intervals);
    if (mean < 120 && s.intervals.length > 6) {
      score -= 20;
      ev.push({ signal: "Sub-human event cadence", direction: "negative", weight: 20 });
    } else if (cv < 0.15 && mean < 5_000) {
      score -= 15;
      ev.push({ signal: "Regular, script-like timing", direction: "negative", weight: 15 });
    } else if (cv > 0.35) {
      score += 6;
      ev.push({ signal: "Human-like timing variance", direction: "positive", weight: 6 });
    }
  }

  // Navigation depth
  if (s.paths.size >= 2) {
    score += 5;
    ev.push({ signal: "Multi-page navigation", direction: "positive", weight: 5 });
  }
  if (s.paths.size >= 4) {
    score += 4;
    ev.push({ signal: "Deep exploration", direction: "positive", weight: 4 });
  }

  // Product signals
  if (s.names.has("upload_started") || s.names.has("upload_completed")) {
    score += 8;
    ev.push({ signal: "Started product workflow", direction: "positive", weight: 8 });
  }
  if (s.names.has("enhance_completed")) {
    score += 12;
    ev.push({ signal: "Completed enhancement", direction: "positive", weight: 12 });
  }
  if (s.names.has("download_completed")) {
    score += 10;
    ev.push({ signal: "Downloaded result", direction: "positive", weight: 10 });
  }

  if (s.errors > 3) {
    score -= 10;
    ev.push({ signal: "Repeated errors", direction: "negative", weight: 10 });
  }

  // Single-hit bounce
  if (n === 1 && dur === 0) {
    score -= 5;
    ev.push({ signal: "Single-event bounce", direction: "negative", weight: 5 });
  }

  // ---------- Advanced behavioral signals (from session_summary metrics) ----------
  const sum = s.summary ?? null;
  const num = (k: string): number | null => {
    if (!sum) return null;
    const v = sum[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const bool = (k: string): boolean => sum?.[k] === true;
  const str = (k: string): string | null => (typeof sum?.[k] === "string" ? (sum![k] as string) : null);

  if (sum) {
    // Bot indicators
    if (bool("webdriver")) push("navigator.webdriver present", "negative", 25);
    const langs = num("languages");
    if (langs !== null && langs === 0) push("No browser languages", "negative", 12);
    else if (langs !== null && langs >= 1) push("Language preferences present", "positive", 3);
    const hc = num("hardwareConcurrency");
    if (hc !== null && hc === 0) push("No hardware concurrency", "negative", 8);

    // Reading / engagement
    const readingMode = str("readingMode");
    if (readingMode === "reading") push("Sustained reading behavior", "positive", 12);
    else if (readingMode === "scanning") push("Scanning behavior", "positive", 4);
    else if (readingMode === "abandoning") push("Abandoned quickly", "negative", 10);

    // Scroll
    const scrollMax = num("scrollMaxPct");
    if (scrollMax !== null) {
      if (scrollMax >= 75) push("Deep scroll (>75%)", "positive", 6);
      else if (scrollMax < 5 && (num("sessionMs") ?? 0) > 8_000) push("No scroll in long session", "negative", 10);
    }

    // Mouse — no coords, only summary statistics
    const mouseMoves = num("mouseMoves");
    const mouseSpeedStd = num("mouseSpeedStd");
    if (mouseMoves !== null) {
      if (mouseMoves === 0 && (num("sessionMs") ?? 0) > 6_000 && !bool("hasTouch"))
        push("Zero mouse movement on non-touch device", "negative", 15);
      else if (mouseMoves > 30 && mouseSpeedStd !== null && mouseSpeedStd > 0.05)
        push("Natural mouse movement variance", "positive", 8);
      else if (mouseMoves > 20 && mouseSpeedStd !== null && mouseSpeedStd < 0.005)
        push("Uniform mouse speed (script-like)", "negative", 15);
    }

    // Click rhythm
    const clickCV = num("clickIntervalCV");
    const clickCount = num("clickCount");
    if (clickCount !== null && clickCount >= 4 && clickCV !== null) {
      if (clickCV < 0.1) push("Robotic click rhythm", "negative", 18);
      else if (clickCV > 0.4) push("Natural click rhythm", "positive", 6);
    }
    const bursts = num("burstClicks");
    if (bursts !== null && bursts >= 3) push("Burst clicking", "negative", 6);

    // Timezone / locale consistency
    const tzOff = num("timezoneOffset");
    if (tzOff !== null && tzOff !== new Date().getTimezoneOffset() && !s.country) {
      // Consistency check is soft — country may be missing on non-Cloudflare
      // edges. Do not add strong evidence.
    }

    // Network
    const rtt = num("rtt");
    if (rtt !== null && rtt > 800) push("Very high RTT", "negative", 4);

    // Performance / responsiveness
    const inp = num("inpMs");
    if (inp !== null && inp > 500) push("Poor input responsiveness", "negative", 4);
    if (num("longTasks") !== null && (num("longTasks") as number) > 8)
      push("Many long tasks (slow render path)", "negative", 3);
  }

  // Rage / dead clicks
  if (s.rageClicks > 0) push(`Rage-clicked ${s.rageClicks}×`, "negative", 6);
  if (s.deadClicks > 0) push(`Dead click on ${s.deadClicks} target(s)`, "negative", 5);

  const qualityScore = Math.max(0, Math.min(100, score));

  // Probability mapping — sigmoid around 50.
  const humanProbability = 1 / (1 + Math.exp(-(qualityScore - 50) / 12));
  const automationProbability = 1 - humanProbability;

  // Confidence: more evidence + longer session → higher confidence.
  const evidencePoints = ev.reduce((a, b) => a + b.weight, 0);
  const confidence: Confidence =
    evidencePoints >= 30 && (n >= 4 || dur >= 10_000)
      ? "high"
      : evidencePoints >= 15
        ? "medium"
        : "low";

  // Intent + engagement
  let intent = 20;
  if (s.names.has("upload_started")) intent += 20;
  if (s.names.has("enhance_started")) intent += 20;
  if (s.names.has("enhance_completed")) intent += 20;
  if (s.names.has("download_completed")) intent += 20;
  intent = Math.min(100, intent);

  let engagement = Math.min(100, Math.round((dur / 60_000) * 40 + s.paths.size * 10 + n * 2));

  // Segmentation
  const seg = segmentOf(s, qualityScore);

  // Risk level: high risk when automation probability is elevated *and* we
  // have strong evidence backing it. Otherwise degrade gracefully so we
  // never over-flag genuine but low-signal sessions.
  const evidencePointsFinal = ev.reduce((a, b) => a + b.weight, 0);
  const riskLevel: "low" | "medium" | "high" =
    automationProbability > 0.7 && evidencePointsFinal >= 30
      ? "high"
      : automationProbability > 0.4
        ? "medium"
        : "low";

  // Serialization-safe summary shape (numbers/strings/booleans/null only).
  let safeSummary: Record<string, number | string | boolean | null> | null = null;
  if (s.summary) {
    safeSummary = {};
    for (const [k, v] of Object.entries(s.summary)) {
      if (v === null) safeSummary[k] = null;
      else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean")
        safeSummary[k] = v;
    }
  }

  return {
    session_id: s.session_id,
    humanProbability,
    automationProbability,
    qualityScore,
    confidence,
    segment: seg,
    intentScore: intent,
    engagementScore: engagement,
    riskLevel,
    evidence: ev.sort((a, b) => b.weight - a.weight),
    reasons: ev.map((e) => (e.direction === "positive" ? "✓ " : "✗ ") + e.signal),
    device: s.device,
    source: s.source,
    country: s.country,
    duration_ms: dur,
    events: n,
    first: new Date(s.first).toISOString(),
    last: new Date(s.last).toISOString(),
    summary: safeSummary,
    rageClicks: s.rageClicks,
    deadClicks: s.deadClicks,
  };
}

function segmentOf(s: SessionAgg, quality: number): Segment {
  if (s.ua_kind === "suspicious" || quality < 20) return "Suspicious";
  if (quality < 35) return "Low Quality";
  if (s.names.has("download_completed") && s.events.length > 12) return "Power User";
  if (s.names.has("enhance_completed")) return "Activated";
  if (s.names.has("upload_started") && !s.names.has("enhance_completed")) return "Failed";
  if (s.paths.size >= 3 && !s.names.has("upload_started")) return "High Intent";
  if (s.paths.size >= 2 || s.events.length >= 3) return "Interested";
  return "Explorer";
}

// ---------- Aggregate intelligence ----------

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
  retention: { supported: boolean; note: string; d1?: number; d7?: number; d30?: number };
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
    const c = classifySession(s);
    sum += c.qualityScore;
    if (c.qualityScore >= 70) dist.high += 1;
    else if (c.qualityScore >= 40) dist.medium += 1;
    else dist.low += 1;
    if (c.humanProbability >= 0.6) human += 1;
    segs[c.segment] = (segs[c.segment] ?? 0) + 1;
    for (const r of c.evidence)
      reasonTally[r.signal] = (reasonTally[r.signal] ?? 0) + 1;
  }

  const avg = total ? sum / total : 0;
  const humanPct = total ? human / total : 0;
  const classification: "high" | "medium" | "low" =
    avg >= 70 ? "high" : avg >= 40 ? "medium" : "low";

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
        `${((explorers / total) * 100).toFixed(0)}% of sessions never reached the product. Landing → product conversion is weak.`,
      );
    if (dist.low / total > 0.3)
      insights.push(
        `${((dist.low / total) * 100).toFixed(0)}% of sessions scored low quality — expect automation or bounces.`,
      );
    if (activated > 0 && activated / total < 0.05)
      insights.push(
        "Activation rate is below 5%. Consider a stronger call-to-action or fewer steps before first enhancement.",
      );
    if (humanPct > 0.9)
      insights.push(
        `${(humanPct * 100).toFixed(0)}% of sessions look human — traffic quality is strong.`,
      );

    const deviceCount: Record<string, number> = {};
    const deviceConv: Record<string, number> = {};
    for (const s of sessions.values()) {
      const d = s.device ?? "unknown";
      deviceCount[d] = (deviceCount[d] ?? 0) + 1;
      if (s.names.has("enhance_completed")) deviceConv[d] = (deviceConv[d] ?? 0) + 1;
    }
    const desktopConv = (deviceConv["desktop"] ?? 0) / Math.max(1, deviceCount["desktop"] ?? 0);
    const mobileConv = (deviceConv["mobile"] ?? 0) / Math.max(1, deviceCount["mobile"] ?? 0);
    if (deviceCount["desktop"] && deviceCount["mobile"] && desktopConv > mobileConv * 1.5)
      insights.push(
        `Desktop converts ${(desktopConv * 100).toFixed(0)}% vs mobile ${(mobileConv * 100).toFixed(0)}%. Mobile UX may need attention.`,
      );
  }

  const topReasons = Object.entries(reasonTally)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    window_days: days,
    overall: { score: Math.round(avg), classification, humanPct, automationPct: 1 - humanPct, sessions: total },
    distribution: dist,
    segments: segs,
    topReasons,
    retention: {
      supported: false,
      note:
        "Retention requires stable visitor identity. Session IDs are per-tab and non-persistent by privacy design.",
    },
    insights,
  };
}

// ---------- Visitor timelines ----------

export interface VisitorTimelineEntry {
  ts: string;
  offset_ms: number;
  name: string;
  path: string | null;
}
export interface VisitorTimeline {
  classification: SessionClassification;
  timeline: VisitorTimelineEntry[];
}

export function buildVisitorTimelines(rows: EventRow[], limit = 25): VisitorTimeline[] {
  const sessions = groupSessions(rows);
  const out: VisitorTimeline[] = [];
  for (const s of sessions.values()) {
    const c = classifySession(s);
    const timeline = s.events.map((e) => ({
      ts: e.ts,
      offset_ms: new Date(e.ts).getTime() - s.first,
      name: e.name,
      path: e.path,
    }));
    out.push({ classification: c, timeline });
  }
  // Order by most recent activity, keep top N.
  out.sort((a, b) => new Date(b.classification.last).getTime() - new Date(a.classification.last).getTime());
  return out.slice(0, limit);
}

// ---------- Source intelligence ----------

export interface SourceIntelligence {
  source: string;
  sessions: number;
  humanPct: number;
  automationPct: number;
  avgQuality: number;
  avgIntent: number;
  conversionRate: number; // download / session
  activationRate: number; // enhance / session
  topSegments: { segment: string; n: number }[];
}

export function buildSourceIntelligence(rows: EventRow[]): SourceIntelligence[] {
  const sessions = groupSessions(rows);
  const bySource = new Map<string, SessionClassification[]>();
  for (const s of sessions.values()) {
    const c = classifySession(s);
    const key = s.source ?? "unknown";
    const arr = bySource.get(key) ?? [];
    arr.push(c);
    bySource.set(key, arr);
  }
  const out: SourceIntelligence[] = [];
  for (const [source, list] of bySource) {
    const n = list.length;
    const human = list.filter((c) => c.humanProbability >= 0.6).length;
    const avgQ = list.reduce((a, b) => a + b.qualityScore, 0) / n;
    const avgI = list.reduce((a, b) => a + b.intentScore, 0) / n;
    const conv = list.filter((c) => c.segment === "Power User" || c.evidence.some((e) => e.signal === "Downloaded result")).length;
    const act = list.filter((c) => c.segment === "Activated" || c.segment === "Power User").length;
    const segTally: Record<string, number> = {};
    for (const c of list) segTally[c.segment] = (segTally[c.segment] ?? 0) + 1;
    const topSegments = Object.entries(segTally)
      .map(([segment, n]) => ({ segment, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    out.push({
      source,
      sessions: n,
      humanPct: human / n,
      automationPct: 1 - human / n,
      avgQuality: Math.round(avgQ),
      avgIntent: Math.round(avgI),
      conversionRate: conv / n,
      activationRate: act / n,
      topSegments,
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

// ---------- Real-time intelligence ----------

export interface RealtimeIntelligence {
  windowSeconds: number;
  active: number;
  humanLikely: number;
  suspicious: number;
  unknown: number;
  currentlyUploading: number;
  currentlyEnhancing: number;
  currentlyDownloading: number;
  currentlyExploring: number;
  byCountry: { code: string; n: number }[];
  byDevice: { device: string; n: number }[];
  bySource: { source: string; n: number }[];
}

export function buildRealtimeIntelligence(rows: EventRow[], windowSeconds = 300): RealtimeIntelligence {
  const cutoff = Date.now() - windowSeconds * 1000;
  const recent = rows.filter((r) => new Date(r.ts).getTime() >= cutoff);
  const sessions = groupSessions(recent);
  let human = 0, suspicious = 0, unknown = 0;
  let uploading = 0, enhancing = 0, downloading = 0, exploring = 0;
  const country: Record<string, number> = {};
  const device: Record<string, number> = {};
  const source: Record<string, number> = {};
  for (const s of sessions.values()) {
    const c = classifySession(s);
    if (c.humanProbability >= 0.7) human += 1;
    else if (c.humanProbability <= 0.3) suspicious += 1;
    else unknown += 1;
    const last = s.events[s.events.length - 1]?.name;
    if (last === "upload_started") uploading += 1;
    else if (last === "enhance_started") enhancing += 1;
    else if (last === "enhance_completed" || last === "download_completed") downloading += 1;
    else exploring += 1;
    if (s.country) country[s.country] = (country[s.country] ?? 0) + 1;
    if (s.device) device[s.device] = (device[s.device] ?? 0) + 1;
    if (s.source) source[s.source] = (source[s.source] ?? 0) + 1;
  }
  const rank = <T extends string>(o: Record<T, number>) =>
    (Object.entries(o) as [T, number][]).map(([k, n]) => [k, n] as const).sort((a, b) => b[1] - a[1]);
  return {
    windowSeconds,
    active: sessions.size,
    humanLikely: human,
    suspicious,
    unknown,
    currentlyUploading: uploading,
    currentlyEnhancing: enhancing,
    currentlyDownloading: downloading,
    currentlyExploring: exploring,
    byCountry: rank(country).slice(0, 8).map(([code, n]) => ({ code, n })),
    byDevice: rank(device).slice(0, 5).map(([device, n]) => ({ device, n })),
    bySource: rank(source).slice(0, 5).map(([source, n]) => ({ source, n })),
  };
}

// ---------- Text report ----------

export function buildTextReport(rows: EventRow[], days: number): string {
  const intel = buildIntelligence(rows, days);
  const src = buildSourceIntelligence(rows).slice(0, 8);
  const lines: string[] = [];
  lines.push(`Pixel Perfect Pro — Traffic Intelligence Report`);
  lines.push(`Window: last ${days} day(s) · Generated ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Overall`);
  lines.push(`Sessions: ${intel.overall.sessions}`);
  lines.push(`Quality score: ${intel.overall.score}/100 (${intel.overall.classification})`);
  lines.push(`Human likelihood: ${(intel.overall.humanPct * 100).toFixed(1)}%`);
  lines.push(`Automation likelihood: ${(intel.overall.automationPct * 100).toFixed(1)}%`);
  lines.push("");
  lines.push(`## Distribution`);
  lines.push(`High quality: ${intel.distribution.high}`);
  lines.push(`Medium quality: ${intel.distribution.medium}`);
  lines.push(`Low quality: ${intel.distribution.low}`);
  lines.push("");
  lines.push(`## Segments`);
  for (const [seg, n] of Object.entries(intel.segments).sort((a, b) => b[1] - a[1]))
    lines.push(`${seg}: ${n}`);
  lines.push("");
  lines.push(`## Traffic Sources`);
  for (const s of src)
    lines.push(
      `${s.source}: ${s.sessions} sessions · human ${(s.humanPct * 100).toFixed(0)}% · quality ${s.avgQuality} · conv ${(s.conversionRate * 100).toFixed(1)}%`,
    );
  lines.push("");
  lines.push(`## Top Quality Signals`);
  for (const r of intel.topReasons) lines.push(`${r.reason} — ${r.count}`);
  lines.push("");
  lines.push(`## Automated Insights`);
  for (const i of intel.insights) lines.push(`- ${i}`);
  lines.push("");
  lines.push(`Retention: ${intel.retention.note}`);
  return lines.join("\n");
}

// ---------- Executive intelligence ----------

export interface ExecutiveIntelligence {
  headline: string;
  bullets: string[];
  trafficQuality: number;
  automationTrend: "up" | "down" | "flat";
  topPerformingSource: { source: string; conversionRate: number } | null;
  topCountry: { code: string; sessions: number } | null;
  topBrowser: { name: string; sessions: number } | null;
  bestPage: { path: string; sessions: number } | null;
  worstPage: { path: string; sessions: number; bounceRate: number } | null;
  mostAbandonedFlow: string | null;
  mostSuccessfulFlow: string | null;
  suspiciousPatterns: string[];
  highIntentSessions: number;
  activatedSessions: number;
}

export function buildExecutive(rows: EventRow[], days: number): ExecutiveIntelligence {
  const intel = buildIntelligence(rows, days);
  const src = buildSourceIntelligence(rows);
  const sessions = groupSessions(rows);
  const pathCount: Record<string, number> = {};
  const pathBounce: Record<string, number> = {};
  const country: Record<string, number> = {};
  const browser: Record<string, number> = {};
  let highIntent = 0;
  let activated = 0;
  const suspiciousPatterns: string[] = [];

  for (const s of sessions.values()) {
    const c = classifySession(s);
    if (c.intentScore >= 60) highIntent += 1;
    if (c.segment === "Activated" || c.segment === "Power User") activated += 1;
    const firstPath = s.events[0]?.path ?? null;
    if (firstPath) {
      pathCount[firstPath] = (pathCount[firstPath] ?? 0) + 1;
      if (s.paths.size === 1 && s.events.length <= 2)
        pathBounce[firstPath] = (pathBounce[firstPath] ?? 0) + 1;
    }
    if (s.country) country[s.country] = (country[s.country] ?? 0) + 1;
    if (s.browser) browser[s.browser] = (browser[s.browser] ?? 0) + 1;
    if (c.riskLevel === "high") {
      const pattern = `${s.source ?? "unknown"} · ${s.device ?? "?"} · ${s.country ?? "??"}`;
      if (!suspiciousPatterns.includes(pattern)) suspiciousPatterns.push(pattern);
    }
  }

  const topSource =
    src.filter((s) => s.sessions >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0] ??
    null;

  const rank = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const [topCountryCode, topCountryN] = rank(country)[0] ?? [null, 0];
  const [topBrowserName, topBrowserN] = rank(browser)[0] ?? [null, 0];
  const [bestPagePath, bestPageN] = rank(pathCount)[0] ?? [null, 0];
  const worstEntry = Object.entries(pathCount)
    .map(([p, n]) => ({ p, n, br: (pathBounce[p] ?? 0) / Math.max(1, n) }))
    .filter((x) => x.n >= 5)
    .sort((a, b) => b.br - a.br)[0];

  const flows: Record<string, number> = {};
  for (const s of sessions.values()) {
    const key = Array.from(s.names).filter((x) => x !== "session_summary").slice(0, 5).sort().join(" → ") || "empty";
    flows[key] = (flows[key] ?? 0) + 1;
  }
  const flowsSorted = Object.entries(flows).sort((a, b) => b[1] - a[1]);
  const mostSuccessfulFlow =
    flowsSorted.find(([k]) => k.includes("download_completed"))?.[0] ??
    flowsSorted.find(([k]) => k.includes("enhance_completed"))?.[0] ??
    null;
  const mostAbandonedFlow =
    flowsSorted.find(
      ([k]) => k.includes("upload_started") && !k.includes("enhance_completed"),
    )?.[0] ?? null;

  const bullets: string[] = [];
  bullets.push(
    `Traffic quality is ${intel.overall.classification} (${intel.overall.score}/100) across ${intel.overall.sessions} sessions.`,
  );
  bullets.push(
    `Human likelihood ${(intel.overall.humanPct * 100).toFixed(0)}%, automation likelihood ${(intel.overall.automationPct * 100).toFixed(0)}%.`,
  );
  if (topSource)
    bullets.push(
      `Top-converting source: ${topSource.source} (${(topSource.conversionRate * 100).toFixed(1)}%).`,
    );
  if (mostAbandonedFlow) bullets.push(`Most abandoned flow: ${mostAbandonedFlow}.`);
  if (mostSuccessfulFlow) bullets.push(`Most successful flow: ${mostSuccessfulFlow}.`);
  bullets.push(...intel.insights);

  const headline =
    intel.overall.sessions === 0
      ? "No traffic in the selected window."
      : intel.overall.classification === "high"
        ? "Traffic is strong and looks predominantly human."
        : intel.overall.classification === "low"
          ? "Traffic quality is low — automation or shallow visits dominate."
          : "Traffic quality is mixed — investigate the drop-offs below.";

  return {
    headline,
    bullets,
    trafficQuality: intel.overall.score,
    automationTrend: "flat", // set by trends builder when historical baseline exists
    topPerformingSource: topSource
      ? { source: topSource.source, conversionRate: topSource.conversionRate }
      : null,
    topCountry: topCountryCode ? { code: topCountryCode, sessions: topCountryN } : null,
    topBrowser: topBrowserName ? { name: topBrowserName, sessions: topBrowserN } : null,
    bestPage: bestPagePath ? { path: bestPagePath, sessions: bestPageN } : null,
    worstPage: worstEntry
      ? { path: worstEntry.p, sessions: worstEntry.n, bounceRate: worstEntry.br }
      : null,
    mostAbandonedFlow,
    mostSuccessfulFlow,
    suspiciousPatterns: suspiciousPatterns.slice(0, 5),
    highIntentSessions: highIntent,
    activatedSessions: activated,
  };
}

// ---------- Historical trends ----------

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  humanPct: number;
  automationPct: number;
  quality: number;
  activations: number;
  downloads: number;
  uploads: number;
  errors: number;
}

export interface TrendReport {
  days: number;
  points: TrendPoint[];
  movingAverage: number[]; // 3-day MA of quality
  direction: "up" | "down" | "flat";
  changePct: number;
  forecastQualityNextDay: number | null; // simple last-3-day mean
  forecastNote: string;
}

export function buildTrends(rows: EventRow[], days: number): TrendReport {
  const buckets = new Map<string, EventRow[]>();
  for (const r of rows) {
    const d = r.ts.slice(0, 10);
    const arr = buckets.get(d) ?? [];
    arr.push(r);
    buckets.set(d, arr);
  }
  const points: TrendPoint[] = [];
  for (const [date, dayRows] of Array.from(buckets.entries()).sort()) {
    const sessions = groupSessions(dayRows);
    let sum = 0, human = 0, act = 0, dl = 0, up = 0, err = 0;
    for (const s of sessions.values()) {
      const c = classifySession(s);
      sum += c.qualityScore;
      if (c.humanProbability >= 0.6) human += 1;
      if (c.segment === "Activated" || c.segment === "Power User") act += 1;
      if (s.names.has("download_completed")) dl += 1;
      if (s.names.has("upload_started")) up += 1;
      err += s.errors;
    }
    const n = sessions.size || 1;
    points.push({
      date,
      sessions: sessions.size,
      humanPct: human / n,
      automationPct: 1 - human / n,
      quality: Math.round(sum / n),
      activations: act,
      downloads: dl,
      uploads: up,
      errors: err,
    });
  }

  // 3-day moving average on quality
  const ma: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice = points.slice(Math.max(0, i - 2), i + 1);
    ma.push(Math.round(slice.reduce((a, b) => a + b.quality, 0) / slice.length));
  }
  const first = ma[0] ?? 0;
  const last = ma[ma.length - 1] ?? 0;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const direction: "up" | "down" | "flat" =
    Math.abs(changePct) < 3 ? "flat" : changePct > 0 ? "up" : "down";
  const forecast =
    points.length >= 3
      ? Math.round(
          points.slice(-3).reduce((a, b) => a + b.quality, 0) / 3,
        )
      : points.length > 0
        ? points[points.length - 1].quality
        : null;

  return {
    days,
    points,
    movingAverage: ma,
    direction,
    changePct: Math.round(changePct * 10) / 10,
    forecastQualityNextDay: forecast,
    forecastNote:
      "Forecast is a 3-day trailing mean of observed quality. Not a prediction of future traffic.",
  };
}

// ---------- Alerts ----------

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export function buildAlerts(rows: EventRow[], days: number): Alert[] {
  const trend = buildTrends(rows, days);
  const intel = buildIntelligence(rows, days);
  const alerts: Alert[] = [];
  const points = trend.points;
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const sessDelta = prev.sessions > 0 ? (last.sessions - prev.sessions) / prev.sessions : 0;
    if (sessDelta >= 0.5)
      alerts.push({
        id: "traffic-spike",
        severity: "warning",
        title: "Traffic spike",
        detail: `Sessions increased ${(sessDelta * 100).toFixed(0)}% day-over-day. Verify quality below.`,
      });
    if (sessDelta <= -0.4)
      alerts.push({
        id: "traffic-drop",
        severity: "warning",
        title: "Traffic drop",
        detail: `Sessions fell ${(Math.abs(sessDelta) * 100).toFixed(0)}% day-over-day.`,
      });
    if (last.automationPct - prev.automationPct >= 0.15)
      alerts.push({
        id: "automation-up",
        severity: "critical",
        title: "Automation increased",
        detail: `Automation likelihood rose ${((last.automationPct - prev.automationPct) * 100).toFixed(0)} pts vs previous day.`,
      });
    if (last.errors > prev.errors && last.errors >= 5)
      alerts.push({
        id: "error-spike",
        severity: "warning",
        title: "Error spike",
        detail: `${last.errors} error events today (was ${prev.errors}).`,
      });
    if (prev.downloads > 0 && last.downloads / Math.max(1, last.sessions) <
        (prev.downloads / Math.max(1, prev.sessions)) * 0.5)
      alerts.push({
        id: "conversion-collapse",
        severity: "critical",
        title: "Conversion collapse",
        detail: "Download rate dropped by >50% versus previous day.",
      });
  }
  if (intel.distribution.low > intel.distribution.high * 2 && intel.overall.sessions >= 20)
    alerts.push({
      id: "low-quality-majority",
      severity: "warning",
      title: "High bounce / low-quality majority",
      detail: `${intel.distribution.low} low-quality sessions vs ${intel.distribution.high} high-quality.`,
    });
  return alerts;
}

// ---------- Report generation (multi-format) ----------

export function buildFullReport(
  rows: EventRow[],
  days: number,
  format: "markdown" | "csv" | "html",
): string {
  const intel = buildIntelligence(rows, days);
  const exec = buildExecutive(rows, days);
  const src = buildSourceIntelligence(rows).slice(0, 10);
  const trend = buildTrends(rows, days);
  const alerts = buildAlerts(rows, days);

  if (format === "csv") {
    const out: string[] = [];
    out.push("section,key,value");
    out.push(`overall,sessions,${intel.overall.sessions}`);
    out.push(`overall,score,${intel.overall.score}`);
    out.push(`overall,human_pct,${intel.overall.humanPct.toFixed(3)}`);
    out.push(`overall,automation_pct,${intel.overall.automationPct.toFixed(3)}`);
    for (const [seg, n] of Object.entries(intel.segments))
      out.push(`segment,${seg},${n}`);
    for (const s of src)
      out.push(`source,${s.source},sessions=${s.sessions};quality=${s.avgQuality};conv=${s.conversionRate.toFixed(3)}`);
    for (const p of trend.points)
      out.push(`trend,${p.date},sessions=${p.sessions};quality=${p.quality};human=${p.humanPct.toFixed(2)}`);
    for (const a of alerts) out.push(`alert,${a.severity},${a.title}: ${a.detail.replace(/,/g, ";")}`);
    return out.join("\n");
  }

  if (format === "html") {
    const li = (xs: string[]) => xs.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    return `<!doctype html><meta charset="utf-8"><title>Traffic Intelligence — ${days}d</title>
<style>body{font:14px/1.6 system-ui;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111}h1,h2{margin-top:2rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border-bottom:1px solid #ddd;padding:.35rem .5rem;text-align:left}</style>
<h1>Traffic Intelligence — last ${days}d</h1>
<p><b>${escapeHtml(exec.headline)}</b></p>
<h2>Executive summary</h2><ul>${li(exec.bullets)}</ul>
<h2>Alerts</h2>${alerts.length ? `<ul>${li(alerts.map((a) => `[${a.severity}] ${a.title} — ${a.detail}`))}</ul>` : "<p>No active alerts.</p>"}
<h2>Sources</h2><table><tr><th>Source</th><th>Sessions</th><th>Human %</th><th>Quality</th><th>Conv.</th></tr>${src
      .map(
        (s) =>
          `<tr><td>${escapeHtml(s.source)}</td><td>${s.sessions}</td><td>${(s.humanPct * 100).toFixed(0)}%</td><td>${s.avgQuality}</td><td>${(s.conversionRate * 100).toFixed(1)}%</td></tr>`,
      )
      .join("")}</table>
<h2>Trend (${trend.direction}, ${trend.changePct}%)</h2><table><tr><th>Date</th><th>Sessions</th><th>Quality</th><th>Human %</th></tr>${trend.points
      .map(
        (p) =>
          `<tr><td>${p.date}</td><td>${p.sessions}</td><td>${p.quality}</td><td>${(p.humanPct * 100).toFixed(0)}%</td></tr>`,
      )
      .join("")}</table>
<h2>Insights</h2><ul>${li(intel.insights)}</ul>`;
  }

  // markdown
  const lines: string[] = [];
  lines.push(`# Pixel Perfect Pro — Traffic Intelligence Report`);
  lines.push(`_Window: last ${days} day(s) · Generated ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(`## Executive Summary`);
  lines.push(`> ${exec.headline}`);
  for (const b of exec.bullets) lines.push(`- ${b}`);
  lines.push("");
  lines.push(`## Alerts`);
  if (alerts.length === 0) lines.push("_No active alerts._");
  for (const a of alerts) lines.push(`- **[${a.severity}] ${a.title}** — ${a.detail}`);
  lines.push("");
  lines.push(`## Overall`);
  lines.push(`- Sessions: ${intel.overall.sessions}`);
  lines.push(`- Quality score: ${intel.overall.score}/100 (${intel.overall.classification})`);
  lines.push(`- Human likelihood: ${(intel.overall.humanPct * 100).toFixed(1)}%`);
  lines.push(`- Automation likelihood: ${(intel.overall.automationPct * 100).toFixed(1)}%`);
  lines.push("");
  lines.push(`## Segments`);
  for (const [seg, n] of Object.entries(intel.segments).sort((a, b) => b[1] - a[1]))
    lines.push(`- ${seg}: ${n}`);
  lines.push("");
  lines.push(`## Traffic Sources`);
  for (const s of src)
    lines.push(
      `- **${s.source}** · ${s.sessions} sessions · human ${(s.humanPct * 100).toFixed(0)}% · quality ${s.avgQuality} · conv ${(s.conversionRate * 100).toFixed(1)}%`,
    );
  lines.push("");
  lines.push(`## Trend (${trend.direction}, ${trend.changePct}%)`);
  for (const p of trend.points)
    lines.push(
      `- ${p.date}: ${p.sessions} sessions · quality ${p.quality} · human ${(p.humanPct * 100).toFixed(0)}%`,
    );
  lines.push("");
  lines.push(`Forecast (next day, trailing mean): ${trend.forecastQualityNextDay ?? "n/a"}`);
  lines.push(`_${trend.forecastNote}_`);
  lines.push("");
  lines.push(`## Automated Insights`);
  for (const i of intel.insights) lines.push(`- ${i}`);
  lines.push("");
  lines.push(`## Detected Risks`);
  for (const p of exec.suspiciousPatterns) lines.push(`- ${p}`);
  lines.push("");
  lines.push(`## Appendix`);
  lines.push(`Retention: ${intel.retention.note}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

