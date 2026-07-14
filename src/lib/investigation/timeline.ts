// Unified Investigation Timeline.
//
// Merges heterogeneous per-session events (behavior, alerts, audit,
// bookmark actions, rule/version changes, drift, investigation notes) into
// a single chronological stream. Pure and deterministic — timestamps are
// ISO strings; ordering is stable via string compare and a secondary tie
// breaker on `kind` so equal timestamps never swap.

export type TimelineKind =
  | "behavior"
  | "classification"
  | "alert"
  | "audit"
  | "rule_change"
  | "version_change"
  | "drift"
  | "bookmark"
  | "note";

export interface TimelineEvent {
  ts: string; // ISO
  kind: TimelineKind;
  session_id?: string;
  title: string;
  detail?: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
}

const KIND_ORDER: Record<TimelineKind, number> = {
  version_change: 0,
  rule_change: 1,
  drift: 2,
  classification: 3,
  behavior: 4,
  alert: 5,
  audit: 6,
  bookmark: 7,
  note: 8,
};

export function mergeTimeline(streams: TimelineEvent[][]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const s of streams) out.push(...s);
  out.sort((a, b) => {
    if (a.ts < b.ts) return -1;
    if (a.ts > b.ts) return 1;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
  return out;
}

export interface TimelineFilter {
  kinds?: TimelineKind[];
  from?: string;
  to?: string;
  q?: string;
  session_id?: string;
}

export function filterTimeline(events: TimelineEvent[], f: TimelineFilter): TimelineEvent[] {
  const q = f.q?.trim().toLowerCase();
  return events.filter((e) => {
    if (f.kinds && f.kinds.length > 0 && !f.kinds.includes(e.kind)) return false;
    if (f.from && e.ts < f.from) return false;
    if (f.to && e.ts > f.to) return false;
    if (f.session_id && e.session_id !== f.session_id) return false;
    if (q && !`${e.title} ${e.detail ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Group events into contiguous buckets by ISO date (YYYY-MM-DD). */
export function bucketByDay(events: TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const day = e.ts.slice(0, 10);
    const bucket = map.get(day);
    if (bucket) bucket.push(e);
    else map.set(day, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, es]) => ({
      day,
      events: es,
    }));
}
