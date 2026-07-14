// Alert Lifecycle Management — Enterprise Operations
//
// Pure functional lifecycle engine. Given raw detection snapshots (produced by
// `buildAlerts`) at successive time points, and a monotonically growing log of
// user actions (acknowledge, resolve, mute, tag, note), produce enriched
// AlertLifecycle records that carry the full incident history.
//
// Nothing here talks to Supabase or the browser — it takes plain arrays in and
// returns plain arrays out, so it is fully deterministic and testable. The
// persistence adapter lives in `alerts.functions.ts` and stores detections
// and actions as rows in the `events` table (browser-first, no new tables).
//
// Privacy: alerts never carry PII. `actor` is a user id (uuid) used only for
// display and audit; no email, name, IP, or device data is stored on alerts.

import type { Alert } from "./intelligence.server";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "active" | "acknowledged" | "resolved" | "muted";
export type AlertActionType =
  | "acknowledge"
  | "resolve"
  | "mute"
  | "unmute"
  | "note"
  | "tag"
  | "untag";

/** A single detection snapshot at a point in time (from `buildAlerts`). */
export interface AlertDetection {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  detectedAt: string; // ISO
}

/** A user action against an alert group (persisted, immutable, append-only). */
export interface AlertAction {
  id: string; // ULID-ish; not required for logic but preserved for audit
  alertId: string;
  type: AlertActionType;
  at: string; // ISO
  actor: string; // user id
  note?: string;
  tag?: string;
  mutedUntil?: string; // ISO; only for `mute`
}

export interface SeverityHistoryEntry {
  at: string;
  severity: AlertSeverity;
}

export interface AlertLifecycle {
  id: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  detail: string;
  firstDetected: string;
  lastDetected: string;
  durationMs: number;
  totalOccurrences: number;
  severityHistory: SeverityHistoryEntry[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  muted: boolean;
  mutedUntil?: string;
  recurring: boolean;
  recurrenceCount: number; // number of distinct re-occurrence windows
  relatedGroup: string; // groups related alert types together
  notes: { at: string; actor: string; text: string }[];
  tags: string[];
}

/** Buckets that group semantically related alert ids for cross-referencing. */
const RELATED_GROUP: Record<string, string> = {
  "traffic-spike": "traffic",
  "traffic-drop": "traffic",
  "automation-up": "quality",
  "low-quality-majority": "quality",
  "error-spike": "reliability",
  "conversion-collapse": "conversion",
};

export function relatedGroupOf(id: string): string {
  return RELATED_GROUP[id] ?? "other";
}

/** Gap (ms) that separates two detections into distinct recurrence windows. */
export const RECURRENCE_GAP_MS = 6 * 60 * 60 * 1000; // 6h

interface BuildInput {
  detections: AlertDetection[];
  actions: AlertAction[];
  now?: number;
}

/**
 * Build lifecycle records from detections + actions. Pure and idempotent:
 * the same inputs always produce the same output. Actions are applied in
 * chronological order and NEVER overwrite prior lifecycle state — every
 * acknowledge/resolve is preserved in `severityHistory`, `notes`, etc.
 */
export function buildAlertLifecycles({ detections, actions, now = Date.now() }: BuildInput): AlertLifecycle[] {
  // Group detections by id, preserving chronological order.
  const byId = new Map<string, AlertDetection[]>();
  const sortedDet = [...detections].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
  for (const d of sortedDet) {
    const arr = byId.get(d.id) ?? [];
    arr.push(d);
    byId.set(d.id, arr);
  }
  const sortedActions = [...actions].sort((a, b) => a.at.localeCompare(b.at));

  const out: AlertLifecycle[] = [];
  for (const [id, dets] of byId) {
    const first = dets[0];
    const last = dets[dets.length - 1];
    const firstTs = Date.parse(first.detectedAt);
    const lastTs = Date.parse(last.detectedAt);

    // Recurrence windows: consecutive detections separated by > RECURRENCE_GAP_MS.
    let recurrenceCount = 1;
    for (let i = 1; i < dets.length; i++) {
      const prev = Date.parse(dets[i - 1].detectedAt);
      const cur = Date.parse(dets[i].detectedAt);
      if (cur - prev > RECURRENCE_GAP_MS) recurrenceCount++;
    }

    const severityHistory: SeverityHistoryEntry[] = [];
    let prevSev: AlertSeverity | null = null;
    for (const d of dets) {
      if (d.severity !== prevSev) {
        severityHistory.push({ at: d.detectedAt, severity: d.severity });
        prevSev = d.severity;
      }
    }

    const lifecycle: AlertLifecycle = {
      id,
      type: id,
      severity: last.severity,
      status: "active",
      title: last.title,
      detail: last.detail,
      firstDetected: first.detectedAt,
      lastDetected: last.detectedAt,
      durationMs: Math.max(0, lastTs - firstTs),
      totalOccurrences: dets.length,
      severityHistory,
      acknowledged: false,
      resolved: false,
      muted: false,
      recurring: recurrenceCount > 1,
      recurrenceCount,
      relatedGroup: relatedGroupOf(id),
      notes: [],
      tags: [],
    };

    // Apply actions in chronological order. If a NEW detection occurs after a
    // resolve, the alert is re-opened (recurring incident semantics), but the
    // prior resolve stays in history via a note trail.
    for (const a of sortedActions) {
      if (a.alertId !== id) continue;
      const actionTs = Date.parse(a.at);
      applyAction(lifecycle, a, actionTs);
    }

    // Re-open if a later detection happens after a resolve action.
    if (lifecycle.resolved && lifecycle.resolvedAt) {
      const resolvedTs = Date.parse(lifecycle.resolvedAt);
      if (lastTs > resolvedTs) {
        lifecycle.status = "active";
        lifecycle.resolved = false;
        lifecycle.recurring = true;
        lifecycle.notes.push({
          at: last.detectedAt,
          actor: "system",
          text: `Reopened: new detection at ${last.detectedAt} after prior resolve at ${lifecycle.resolvedAt}.`,
        });
      }
    }

    // Muted expiry check.
    if (lifecycle.muted && lifecycle.mutedUntil && Date.parse(lifecycle.mutedUntil) <= now) {
      lifecycle.muted = false;
      if (!lifecycle.resolved && !lifecycle.acknowledged) lifecycle.status = "active";
    }

    out.push(lifecycle);
  }
  return out;
}

function applyAction(lc: AlertLifecycle, a: AlertAction, _at: number) {
  switch (a.type) {
    case "acknowledge":
      lc.acknowledged = true;
      lc.acknowledgedBy = a.actor;
      lc.acknowledgedAt = a.at;
      if (lc.status === "active") lc.status = "acknowledged";
      if (a.note) lc.notes.push({ at: a.at, actor: a.actor, text: a.note });
      break;
    case "resolve":
      lc.resolved = true;
      lc.resolvedBy = a.actor;
      lc.resolvedAt = a.at;
      lc.status = "resolved";
      if (a.note) lc.notes.push({ at: a.at, actor: a.actor, text: a.note });
      break;
    case "mute":
      lc.muted = true;
      lc.mutedUntil = a.mutedUntil;
      lc.status = "muted";
      if (a.note) lc.notes.push({ at: a.at, actor: a.actor, text: a.note });
      break;
    case "unmute":
      lc.muted = false;
      lc.mutedUntil = undefined;
      if (!lc.resolved && !lc.acknowledged) lc.status = "active";
      else if (lc.acknowledged && !lc.resolved) lc.status = "acknowledged";
      break;
    case "note":
      if (a.note) lc.notes.push({ at: a.at, actor: a.actor, text: a.note });
      break;
    case "tag":
      if (a.tag && !lc.tags.includes(a.tag)) lc.tags.push(a.tag);
      break;
    case "untag":
      if (a.tag) lc.tags = lc.tags.filter((t) => t !== a.tag);
      break;
  }
}

// ---------- Filter / search / sort ----------

export interface AlertFilter {
  status?: AlertStatus | "all";
  severity?: AlertSeverity | "all";
  search?: string;
  group?: string;
  tag?: string;
}

export function filterAlerts(list: AlertLifecycle[], f: AlertFilter): AlertLifecycle[] {
  const q = (f.search ?? "").trim().toLowerCase();
  return list.filter((a) => {
    if (f.status && f.status !== "all" && a.status !== f.status) return false;
    if (f.severity && f.severity !== "all" && a.severity !== f.severity) return false;
    if (f.group && a.relatedGroup !== f.group) return false;
    if (f.tag && !a.tags.includes(f.tag)) return false;
    if (q) {
      const hay = `${a.title} ${a.detail} ${a.id} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type AlertSort =
  | "severity"
  | "lastDetected"
  | "firstDetected"
  | "recurrence"
  | "occurrences";

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 3, warning: 2, info: 1 };

export function sortAlerts(list: AlertLifecycle[], sort: AlertSort): AlertLifecycle[] {
  const copy = [...list];
  switch (sort) {
    case "severity":
      copy.sort(
        (a, b) =>
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          b.lastDetected.localeCompare(a.lastDetected),
      );
      break;
    case "lastDetected":
      copy.sort((a, b) => b.lastDetected.localeCompare(a.lastDetected));
      break;
    case "firstDetected":
      copy.sort((a, b) => b.firstDetected.localeCompare(a.firstDetected));
      break;
    case "recurrence":
      copy.sort((a, b) => b.recurrenceCount - a.recurrenceCount);
      break;
    case "occurrences":
      copy.sort((a, b) => b.totalOccurrences - a.totalOccurrences);
      break;
  }
  return copy;
}

/** Convert raw `Alert[]` from `buildAlerts` into detections stamped at now. */
export function detectionsFromAlerts(alerts: Alert[], at: string): AlertDetection[] {
  return alerts.map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    detectedAt: at,
  }));
}
