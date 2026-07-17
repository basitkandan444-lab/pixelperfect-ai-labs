// Cohort retention. Pure. Groups sessions by their FIRST-SEEN bucket
// (daily / weekly / monthly) and measures how many sessions from that cohort
// RETURNED with a *meaningful retention event* in subsequent buckets.
//
// Wave B correctness fix: by default retention is only counted for meaningful
// product events (upload_completed, enhance_started, enhance_completed,
// download_completed). Callers can override the retention set explicitly.
// Cohort ASSIGNMENT still uses first-seen across ALL events (so a session
// that only page-viewed on day 0 and enhanced on day 2 is correctly placed
// in the day-0 cohort and marked as retained on day 2).

export type CohortEventRow = {
  session_id: string;
  ts: string;
  /** Event name — used to filter which activities count as retention. */
  name?: string;
};

export type CohortRow = {
  cohort: string; // ISO date (daily) or bucket label (YYYY-Www / YYYY-MM)
  size: number; // sessions first seen in this bucket
  // retention[i] = fraction of the cohort that returned in bucket cohort + i
  // AND performed a meaningful retention event in that bucket.
  // retention[0] is by definition <= 1 (only counts sessions that were both
  // first-seen AND performed a retention event in bucket 0).
  retention: number[];
};

export type CohortGranularity = "daily" | "weekly" | "monthly";

export type CohortResult = {
  window: number; // buckets projected forward
  granularity: CohortGranularity;
  retention_events: string[]; // which event names counted as "retention"
  cohorts: CohortRow[];
};

export type CohortOpts = {
  granularity?: CohortGranularity;
  /** Explicit list of event names that count as retention. Defaults to
   *  DEFAULT_RETENTION_EVENTS. Pass ["*"] to count any event (legacy). */
  retentionEvents?: readonly string[];
};

export const DEFAULT_RETENTION_EVENTS = [
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "download_completed",
] as const;

const DAY = 86_400_000;

function dayIndex(ts: number): number {
  return Math.floor(ts / DAY);
}

function bucketIndex(ts: number, g: CohortGranularity): number {
  if (g === "daily") return dayIndex(ts);
  if (g === "weekly") {
    // ISO week starts Monday. UNIX epoch (1970-01-01) was a Thursday, so
    // shift by 3 days before dividing.
    return Math.floor((dayIndex(ts) + 3) / 7);
  }
  // monthly — calendar month, UTC
  const d = new Date(ts);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function bucketLabel(idx: number, g: CohortGranularity): string {
  if (g === "daily") {
    return new Date(idx * DAY).toISOString().slice(0, 10);
  }
  if (g === "weekly") {
    // Convert back to the Monday date of that ISO-ish week
    const dayIdx = idx * 7 - 3;
    const d = new Date(dayIdx * DAY);
    const year = d.getUTCFullYear();
    // ISO week number
    const target = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week =
      1 +
      Math.round(
        ((target.getTime() - firstThursday.getTime()) / DAY -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7,
      );
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  const year = Math.floor(idx / 12);
  const month = idx % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * @param events raw session events from `public.events` (session_id + ts [+ name]).
 * @param windowBuckets number of buckets to project retention across (>=1).
 * @param opts granularity + retention-event filter.
 */
export function computeCohorts(
  events: CohortEventRow[],
  windowBuckets: number,
  opts: CohortOpts = {},
): CohortResult {
  const w = Math.max(1, Math.floor(windowBuckets));
  const g: CohortGranularity = opts.granularity ?? "daily";
  const retentionEventsIn = opts.retentionEvents ?? DEFAULT_RETENTION_EVENTS;
  const retentionAll = retentionEventsIn.length === 1 && retentionEventsIn[0] === "*";
  const retentionSet = new Set(retentionEventsIn);

  // firstBucket[sid] = earliest bucket index seen for this session (across ALL events)
  const firstBucket = new Map<string, number>();
  // returnBuckets[sid] = Set<bucketIndex> where session performed a retention event
  const returnBuckets = new Map<string, Set<number>>();

  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    const b = bucketIndex(t, g);
    const prev = firstBucket.get(e.session_id);
    if (prev === undefined || b < prev) firstBucket.set(e.session_id, b);
    const name = e.name ?? "";
    const isRetention = retentionAll || retentionSet.has(name);
    if (isRetention) {
      let s = returnBuckets.get(e.session_id);
      if (!s) {
        s = new Set();
        returnBuckets.set(e.session_id, s);
      }
      s.add(b);
    }
  }

  // Group sessions by first-seen bucket.
  const cohorts = new Map<number, string[]>();
  for (const [sid, fb] of firstBucket) {
    let arr = cohorts.get(fb);
    if (!arr) {
      arr = [];
      cohorts.set(fb, arr);
    }
    arr.push(sid);
  }

  const sortedCohortBuckets = [...cohorts.keys()].sort((a, b) => a - b);
  const out: CohortRow[] = [];
  for (const cb of sortedCohortBuckets) {
    const sids = cohorts.get(cb)!;
    const size = sids.length;
    const retention = new Array(w).fill(0);
    for (const sid of sids) {
      const rs = returnBuckets.get(sid);
      if (!rs) continue;
      for (let i = 0; i < w; i++) if (rs.has(cb + i)) retention[i] += 1;
    }
    out.push({
      cohort: bucketLabel(cb, g),
      size,
      retention: retention.map((n) => (size ? round(n / size) : 0)),
    });
  }
  return {
    window: w,
    granularity: g,
    retention_events: [...retentionEventsIn],
    cohorts: out,
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
