// Loop 1.1 — Alert operations utilities: rich timeline, MTTA/MTTR & noise
// metrics, and correlation into higher-level incidents.
//
// All functions are pure and deterministic. They take plain data in, plain
// data out; nothing here touches Supabase, the DOM, or process globals.

import type {
  AlertAction,
  AlertDetection,
  AlertLifecycle,
  AlertSeverity,
} from "./alerts";

// ---------- Rich lifecycle timeline ----------

export type TimelineKind =
  | "detected"
  | "severity_change"
  | "acknowledge"
  | "resolve"
  | "mute"
  | "unmute"
  | "note"
  | "tag"
  | "untag"
  | "reopened";

export interface TimelineEntry {
  at: string; // ISO
  kind: TimelineKind;
  severity?: AlertSeverity;
  actor?: string;
  note?: string;
  tag?: string;
  mutedUntil?: string;
  detail?: string;
}

/**
 * Merge detections + actions for one alert id into a single chronological
 * timeline. Emits `severity_change` only when severity actually flips, and a
 * synthetic `reopened` entry when a new detection lands after a resolve.
 */
export function buildAlertTimeline(
  alertId: string,
  detections: AlertDetection[],
  actions: AlertAction[],
): TimelineEntry[] {
  const dets = detections
    .filter((d) => d.id === alertId)
    .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
  const acts = actions
    .filter((a) => a.alertId === alertId)
    .sort((a, b) => a.at.localeCompare(b.at));

  const out: TimelineEntry[] = [];
  let prevSev: AlertSeverity | null = null;
  let lastResolveAt: string | null = null;
  let i = 0;
  let j = 0;

  while (i < dets.length || j < acts.length) {
    const d = dets[i];
    const a = acts[j];
    const takeDetection = a === undefined || (d !== undefined && d.detectedAt <= a.at);

    if (takeDetection && d) {
      if (lastResolveAt && d.detectedAt > lastResolveAt) {
        out.push({
          at: d.detectedAt,
          kind: "reopened",
          detail: `New detection after resolve at ${lastResolveAt}`,
        });
        lastResolveAt = null;
      }
      if (d.severity !== prevSev) {
        out.push({
          at: d.detectedAt,
          kind: prevSev === null ? "detected" : "severity_change",
          severity: d.severity,
          detail: d.detail,
        });
        prevSev = d.severity;
      } else {
        out.push({ at: d.detectedAt, kind: "detected", severity: d.severity });
      }
      i++;
    } else if (a) {
      out.push({
        at: a.at,
        kind: a.type as TimelineKind,
        actor: a.actor,
        note: a.note,
        tag: a.tag,
        mutedUntil: a.mutedUntil,
      });
      if (a.type === "resolve") lastResolveAt = a.at;
      j++;
    }
  }
  return out;
}

// ---------- Operational metrics: MTTA / MTTR / noise / recurrence ----------

export interface AlertOpsMetrics {
  totalAlerts: number;
  activeAlerts: number;
  acknowledgedAlerts: number;
  resolvedAlerts: number;
  mutedAlerts: number;
  ackRate: number; // 0..1
  resolveRate: number; // 0..1
  mttaMs: number | null; // mean time to acknowledge
  mttrMs: number | null; // mean time to resolve
  medianMttaMs: number | null;
  medianMttrMs: number | null;
  p95MttrMs: number | null;
  recurringCount: number;
  topRecurring: { id: string; title: string; recurrenceCount: number }[];
  noisyAlerts: { id: string; title: string; occurrences: number }[];
  bySeverity: Record<AlertSeverity, number>;
}

export const NOISY_OCCURRENCE_THRESHOLD = 20;

const percentile = (xs: number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(p * (s.length - 1)));
  return s[idx];
};

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function computeAlertOpsMetrics(lifecycles: AlertLifecycle[]): AlertOpsMetrics {
  const mttas: number[] = [];
  const mttrs: number[] = [];
  const bySeverity: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
  let active = 0;
  let acked = 0;
  let resolved = 0;
  let muted = 0;
  let recurring = 0;

  for (const l of lifecycles) {
    bySeverity[l.severity]++;
    if (l.status === "active") active++;
    if (l.acknowledged) acked++;
    if (l.resolved) resolved++;
    if (l.muted) muted++;
    if (l.recurring) recurring++;
    if (l.acknowledgedAt) {
      mttas.push(Math.max(0, Date.parse(l.acknowledgedAt) - Date.parse(l.firstDetected)));
    }
    if (l.resolvedAt) {
      mttrs.push(Math.max(0, Date.parse(l.resolvedAt) - Date.parse(l.firstDetected)));
    }
  }

  return {
    totalAlerts: lifecycles.length,
    activeAlerts: active,
    acknowledgedAlerts: acked,
    resolvedAlerts: resolved,
    mutedAlerts: muted,
    ackRate: lifecycles.length ? acked / lifecycles.length : 0,
    resolveRate: lifecycles.length ? resolved / lifecycles.length : 0,
    mttaMs: mean(mttas),
    mttrMs: mean(mttrs),
    medianMttaMs: median(mttas),
    medianMttrMs: median(mttrs),
    p95MttrMs: percentile(mttrs, 0.95),
    recurringCount: recurring,
    topRecurring: [...lifecycles]
      .filter((l) => l.recurring)
      .sort((a, b) => b.recurrenceCount - a.recurrenceCount)
      .slice(0, 5)
      .map((l) => ({ id: l.id, title: l.title, recurrenceCount: l.recurrenceCount })),
    noisyAlerts: [...lifecycles]
      .filter((l) => l.totalOccurrences >= NOISY_OCCURRENCE_THRESHOLD)
      .sort((a, b) => b.totalOccurrences - a.totalOccurrences)
      .slice(0, 5)
      .map((l) => ({ id: l.id, title: l.title, occurrences: l.totalOccurrences })),
    bySeverity,
  };
}

// ---------- Correlation into incidents ----------

export interface Incident {
  id: string;
  group: string;
  alerts: string[]; // alert ids
  severity: AlertSeverity;
  startedAt: string;
  endedAt: string;
  active: boolean;
  title: string;
  summary: string;
  alertCount: number;
}

export const CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 min

const SEV_RANK: Record<AlertSeverity, number> = { info: 1, warning: 2, critical: 3 };

/**
 * Group related alerts (same `relatedGroup`) whose detection windows overlap
 * or land within CORRELATION_WINDOW_MS into a single incident. Solo alerts
 * or the "other" bucket do not form incidents.
 */
export function correlateIncidents(lifecycles: AlertLifecycle[]): Incident[] {
  const byGroup = new Map<string, AlertLifecycle[]>();
  for (const l of lifecycles) {
    const arr = byGroup.get(l.relatedGroup) ?? [];
    arr.push(l);
    byGroup.set(l.relatedGroup, arr);
  }

  const incidents: Incident[] = [];
  for (const [group, list] of byGroup) {
    if (group === "other" || list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.firstDetected.localeCompare(b.firstDetected));

    let current: AlertLifecycle[] = [];
    let curStart = 0;
    let curEnd = 0;

    const flush = () => {
      if (current.length < 2) {
        current = [];
        return;
      }
      const sev = current.reduce<AlertSeverity>(
        (s, l) => (SEV_RANK[l.severity] > SEV_RANK[s] ? l.severity : s),
        "info",
      );
      const active = current.some((l) => l.status === "active");
      incidents.push({
        id: `inc-${group}-${curStart}`,
        group,
        alerts: current.map((l) => l.id),
        severity: sev,
        startedAt: new Date(curStart).toISOString(),
        endedAt: new Date(curEnd).toISOString(),
        active,
        title: `${group} incident (${current.length} alerts)`,
        summary: current.map((l) => l.title).join(" · "),
        alertCount: current.length,
      });
      current = [];
    };

    for (const l of sorted) {
      const s = Date.parse(l.firstDetected);
      const e = Date.parse(l.lastDetected);
      if (current.length === 0) {
        current = [l];
        curStart = s;
        curEnd = e;
        continue;
      }
      if (s - curEnd <= CORRELATION_WINDOW_MS) {
        current.push(l);
        if (e > curEnd) curEnd = e;
      } else {
        flush();
        current = [l];
        curStart = s;
        curEnd = e;
      }
    }
    flush();
  }
  return incidents.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
