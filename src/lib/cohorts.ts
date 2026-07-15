// Cohort retention. Pure. Groups sessions by their FIRST-SEEN day (cohort) and
// measures how many sessions from that cohort returned on subsequent days
// (identified by session_id). No PII.

export type CohortEventRow = { session_id: string; ts: string };

export type CohortRow = {
  cohort: string; // ISO date, YYYY-MM-DD
  size: number; // sessions first seen this day
  // retention[i] = fraction of the cohort that returned on day cohort + i.
  // retention[0] is always 1 (definition: sessions active on their cohort day).
  retention: number[];
};

export type CohortResult = {
  window_days: number;
  cohorts: CohortRow[];
};

const DAY = 86_400_000;

function dayKey(ts: number): string {
  return new Date(Math.floor(ts / DAY) * DAY).toISOString().slice(0, 10);
}

function dayIndex(ts: number): number {
  return Math.floor(ts / DAY);
}

/**
 * @param events raw session events from `public.events` (session_id + ts).
 * @param windowDays number of days to project retention across (>=1).
 */
export function computeCohorts(events: CohortEventRow[], windowDays: number): CohortResult {
  const w = Math.max(1, Math.floor(windowDays));
  // session_id -> Set<dayIndex>
  const days = new Map<string, Set<number>>();
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    const d = dayIndex(t);
    let s = days.get(e.session_id);
    if (!s) {
      s = new Set();
      days.set(e.session_id, s);
    }
    s.add(d);
  }

  // Bucket sessions by earliest day.
  const cohorts = new Map<number, string[]>();
  for (const [sid, ds] of days) {
    let min = Infinity;
    for (const d of ds) if (d < min) min = d;
    if (!Number.isFinite(min)) continue;
    let arr = cohorts.get(min);
    if (!arr) {
      arr = [];
      cohorts.set(min, arr);
    }
    arr.push(sid);
  }

  const sortedCohortDays = [...cohorts.keys()].sort((a, b) => a - b);
  const out: CohortRow[] = [];
  for (const cd of sortedCohortDays) {
    const sids = cohorts.get(cd)!;
    const size = sids.length;
    const retention = new Array(w).fill(0);
    for (const sid of sids) {
      const ds = days.get(sid)!;
      for (let i = 0; i < w; i++) if (ds.has(cd + i)) retention[i] += 1;
    }
    out.push({
      cohort: dayKey(cd * DAY),
      size,
      retention: retention.map((n) => (size ? round(n / size) : 0)),
    });
  }
  return { window_days: w, cohorts: out };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
