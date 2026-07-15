// User-journey analysis. Pure. Reduces `page_view` events into ordered
// per-session paths, then aggregates:
//   - the top N distinct paths (session flows)
//   - the top drop-off pages (where sessions ended)
//   - the top entry pages
// No PII beyond `path` (never returns session_ids). Callers are responsible
// for querying only `page_view` events and only `path` + `session_id` + `ts`.

export type JourneyEventRow = {
  session_id: string;
  path: string;
  ts: string;
};

export type JourneyPath = {
  path: string; // steps joined by " > "
  sessions: number;
  fraction: number; // sessions / total
};

export type JourneyDropOff = {
  path: string; // the LAST page visited before the session ended
  sessions: number;
  fraction: number;
};

export type JourneyResult = {
  total_sessions: number;
  top_paths: JourneyPath[];
  top_entries: JourneyDropOff[]; // first page visited
  top_drop_offs: JourneyDropOff[]; // last page visited (bounce approximator)
  avg_depth: number; // avg number of distinct steps per session
};

export function computeJourneys(
  events: JourneyEventRow[],
  opts: { topN?: number; maxDepth?: number } = {},
): JourneyResult {
  const topN = Math.max(1, Math.floor(opts.topN ?? 10));
  const maxDepth = Math.max(1, Math.floor(opts.maxDepth ?? 6));

  // Order events per session by ts.
  const perSession = new Map<string, { path: string; t: number }[]>();
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if (!e.path) continue;
    let arr = perSession.get(e.session_id);
    if (!arr) {
      arr = [];
      perSession.set(e.session_id, arr);
    }
    arr.push({ path: e.path, t });
  }

  const paths = new Map<string, number>();
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  let depthSum = 0;
  let total = 0;

  for (const [, evs] of perSession) {
    evs.sort((a, b) => a.t - b.t);
    // Deduplicate consecutive identical paths.
    const steps: string[] = [];
    for (const e of evs) {
      if (steps[steps.length - 1] !== e.path) steps.push(e.path);
    }
    if (steps.length === 0) continue;
    total += 1;
    depthSum += steps.length;
    const trimmed = steps.slice(0, maxDepth);
    const key = trimmed.join(" > ");
    paths.set(key, (paths.get(key) ?? 0) + 1);
    entries.set(steps[0], (entries.get(steps[0]) ?? 0) + 1);
    exits.set(steps[steps.length - 1], (exits.get(steps[steps.length - 1]) ?? 0) + 1);
  }

  const top = (m: Map<string, number>): JourneyDropOff[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([path, sessions]) => ({
        path,
        sessions,
        fraction: total ? round(sessions / total) : 0,
      }));

  return {
    total_sessions: total,
    top_paths: [...paths.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([path, sessions]) => ({
        path,
        sessions,
        fraction: total ? round(sessions / total) : 0,
      })),
    top_entries: top(entries),
    top_drop_offs: top(exits),
    avg_depth: total ? round(depthSum / total) : 0,
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
