// User-journey analysis. Pure. Reduces events into ordered per-session
// step sequences and aggregates:
//   - top N distinct paths (session flows)
//   - top entry / drop-off pages
//   - avg depth & avg session duration
//   - terminal outcomes: success / error / abandonment (Wave B)
//   - immediate loops (a → b → a) that indicate friction (Wave B)
//   - "worst paths" — highest-volume flows that end in error/abandonment (Wave B)
//   - feature interaction pairs (co-occurrence within a session) (Wave B)
//
// Journey steps are built from a MIX of `page_view` events (with their `path`)
// and product events. Product events become synthetic steps prefixed with
// `@` so paths remain readable, e.g. `/ > @upload_completed > @enhance_started`.
//
// No PII beyond `path` and event names (never returns session_ids).

export type JourneyEventRow = {
  session_id: string;
  /** Optional. Present on `page_view` rows. */
  path?: string | null;
  /** Event name from `public.events`. Required for terminal classification. */
  name?: string | null;
  ts: string;
  /** Optional feature slug for `feature_interaction` events. */
  feature?: string | null;
  /** Optional `ok` flag (used to infer error terminals). */
  ok?: boolean | null;
};

export type JourneyPath = {
  path: string;
  sessions: number;
  fraction: number;
};

export type JourneyDropOff = {
  path: string;
  sessions: number;
  fraction: number;
};

export type JourneyTerminals = {
  success: number; // ended with download_completed / enhance_completed
  error: number; // ended with error / ok===false
  abandonment: number; // neither
};

export type JourneyLoop = {
  loop: string; // "a > b > a"
  sessions: number;
};

export type FeatureInteraction = {
  pair: string; // "A + B" (sorted)
  sessions: number; // number of sessions where both features were used
};

export type WorstPath = {
  path: string;
  sessions: number;
  terminal: "error" | "abandonment";
};

export type JourneyResult = {
  total_sessions: number;
  top_paths: JourneyPath[];
  top_entries: JourneyDropOff[];
  top_drop_offs: JourneyDropOff[];
  avg_depth: number;
  avg_duration_ms: number;
  terminals: JourneyTerminals;
  top_loops: JourneyLoop[];
  worst_paths: WorstPath[];
  feature_interactions: FeatureInteraction[];
};

const SUCCESS_EVENTS = new Set(["download_completed", "enhance_completed"]);
const PRODUCT_EVENT_ALLOWLIST = new Set([
  "upload_started",
  "upload_completed",
  "enhance_started",
  "enhance_completed",
  "enhance_failed",
  "download_completed",
  "error",
]);

export function computeJourneys(
  events: JourneyEventRow[],
  opts: { topN?: number; maxDepth?: number } = {},
): JourneyResult {
  const topN = Math.max(1, Math.floor(opts.topN ?? 10));
  const maxDepth = Math.max(1, Math.floor(opts.maxDepth ?? 6));

  type Step = { step: string; t: number; name: string; ok: boolean | null };
  const perSession = new Map<string, Step[]>();
  const featureUse = new Map<string, Set<string>>(); // session_id -> features

  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    const name = (e.name ?? "").trim();
    let step: string | null = null;
    if (name === "page_view" || name === "") {
      if (!e.path) continue;
      step = e.path;
    } else if (PRODUCT_EVENT_ALLOWLIST.has(name)) {
      step = `@${name}`;
    } else if (name === "feature_interaction") {
      const f = (e.feature ?? "").trim();
      if (f) {
        let s = featureUse.get(e.session_id);
        if (!s) {
          s = new Set();
          featureUse.set(e.session_id, s);
        }
        s.add(f);
      }
      continue; // features don't become path steps
    } else {
      continue;
    }
    let arr = perSession.get(e.session_id);
    if (!arr) {
      arr = [];
      perSession.set(e.session_id, arr);
    }
    arr.push({ step, t, name: name || "page_view", ok: e.ok ?? null });
  }

  const paths = new Map<string, number>();
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  const loops = new Map<string, number>();
  const worstAgg = new Map<string, { sessions: number; terminal: "error" | "abandonment" }>();
  let depthSum = 0;
  let durationSum = 0;
  let total = 0;
  const terminals: JourneyTerminals = { success: 0, error: 0, abandonment: 0 };

  for (const [, evs] of perSession) {
    evs.sort((a, b) => a.t - b.t);
    // De-dupe consecutive identical steps
    const steps: Step[] = [];
    for (const s of evs) {
      if (steps[steps.length - 1]?.step !== s.step) steps.push(s);
    }
    if (steps.length === 0) continue;
    total += 1;
    depthSum += steps.length;
    durationSum += steps[steps.length - 1].t - steps[0].t;

    // Terminal classification
    let terminal: "success" | "error" | "abandonment";
    const hasSuccess = evs.some((e) => SUCCESS_EVENTS.has(e.name));
    const last = evs[evs.length - 1];
    if (hasSuccess) terminal = "success";
    else if (last.name === "error" || last.ok === false) terminal = "error";
    else terminal = "abandonment";
    terminals[terminal] += 1;

    // Path aggregation (truncate to maxDepth)
    const trimmed = steps.slice(0, maxDepth).map((s) => s.step);
    const key = trimmed.join(" > ");
    paths.set(key, (paths.get(key) ?? 0) + 1);
    entries.set(steps[0].step, (entries.get(steps[0].step) ?? 0) + 1);
    exits.set(steps[steps.length - 1].step, (exits.get(steps[steps.length - 1].step) ?? 0) + 1);

    // Immediate loop detection: a > b > a within the trimmed path
    for (let i = 0; i + 2 < trimmed.length; i++) {
      if (trimmed[i] === trimmed[i + 2] && trimmed[i] !== trimmed[i + 1]) {
        const lk = `${trimmed[i]} > ${trimmed[i + 1]} > ${trimmed[i]}`;
        loops.set(lk, (loops.get(lk) ?? 0) + 1);
      }
    }

    if (terminal !== "success") {
      const prev = worstAgg.get(key);
      if (prev) prev.sessions += 1;
      else worstAgg.set(key, { sessions: 1, terminal });
    }
  }

  // Feature interaction pairs — session-level co-occurrence
  const featPairs = new Map<string, number>();
  for (const [, feats] of featureUse) {
    const arr = [...feats].sort();
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const k = `${arr[i]} + ${arr[j]}`;
        featPairs.set(k, (featPairs.get(k) ?? 0) + 1);
      }
    }
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
    avg_duration_ms: total ? Math.round(durationSum / total) : 0,
    terminals,
    top_loops: [...loops.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([loop, sessions]) => ({ loop, sessions })),
    worst_paths: [...worstAgg.entries()]
      .sort((a, b) => b[1].sessions - a[1].sessions)
      .slice(0, topN)
      .map(([path, v]) => ({ path, sessions: v.sessions, terminal: v.terminal })),
    feature_interactions: [...featPairs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([pair, sessions]) => ({ pair, sessions })),
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
