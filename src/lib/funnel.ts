// Pure funnel + conversion aggregation. No I/O, no PII. Operates on rows
// already fetched from `public.events`. Fully unit-testable in isolation.
//
// A funnel is an ORDERED list of event names. For each session we ask:
//   - what is the furthest step (by first-occurrence ts) that session reached?
// Conversion at step i = sessions that reached step i / sessions that reached step 0.

export type EventRow = {
  session_id: string;
  name: string;
  ts: string; // ISO timestamp
};

export type FunnelStep = {
  name: string;
  sessions: number;
  conversion_from_start: number; // 0..1
  step_conversion: number; // vs previous step, 0..1
  drop_off: number; // vs previous step, 0..1
};

export type FunnelResult = {
  steps: FunnelStep[];
  total_sessions: number;
  completed_sessions: number;
  overall_conversion: number;
};

/**
 * Compute an ordered funnel. A session "reaches" step i only if it emitted
 * step i AFTER (or at) the timestamp of step i-1. This prevents out-of-order
 * events from inflating conversion numbers.
 */
export function computeFunnel(events: EventRow[], steps: string[]): FunnelResult {
  if (steps.length === 0) {
    return { steps: [], total_sessions: 0, completed_sessions: 0, overall_conversion: 0 };
  }

  // Group first-timestamp per (session, name).
  const perSession = new Map<string, Map<string, number>>();
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    let m = perSession.get(e.session_id);
    if (!m) {
      m = new Map();
      perSession.set(e.session_id, m);
    }
    const prev = m.get(e.name);
    if (prev === undefined || t < prev) m.set(e.name, t);
  }

  const reachedCounts = new Array(steps.length).fill(0);
  let totalSessions = 0;

  for (const [, firsts] of perSession) {
    // Only sessions that hit step 0 count toward the funnel base.
    const t0 = firsts.get(steps[0]);
    if (t0 === undefined) continue;
    totalSessions += 1;
    reachedCounts[0] += 1;
    let prevT = t0;
    for (let i = 1; i < steps.length; i++) {
      const ti = firsts.get(steps[i]);
      if (ti === undefined || ti < prevT) break;
      reachedCounts[i] += 1;
      prevT = ti;
    }
  }

  const base = reachedCounts[0] || 0;
  const out: FunnelStep[] = steps.map((name, i) => {
    const sessions = reachedCounts[i];
    const prev = i === 0 ? sessions : reachedCounts[i - 1];
    return {
      name,
      sessions,
      conversion_from_start: base ? round(sessions / base) : 0,
      step_conversion: prev ? round(sessions / prev) : 0,
      drop_off: prev ? round(1 - sessions / prev) : 0,
    };
  });

  return {
    steps: out,
    total_sessions: totalSessions,
    completed_sessions: reachedCounts[steps.length - 1],
    overall_conversion: base ? round(reachedCounts[steps.length - 1] / base) : 0,
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The canonical Pixel Perfect Pro conversion funnel. */
export const PRIMARY_FUNNEL = [
  "page_view",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "download_completed",
] as const;
