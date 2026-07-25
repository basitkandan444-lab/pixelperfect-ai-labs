// Capability usage + upgrade attribution: for each capability id we track how
// many enhancement runs used it and how many of those sessions later reached
// checkout_started (weak causal attribution — deliberately named as such).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface CapabilityValueRow {
  id: string;
  runs: number;
  upgradeAttributions: number;
  completionRate: number;
}

export async function aggregateCapabilityValue(
  admin: SupabaseClient<Database>,
  sinceIso: string,
): Promise<CapabilityValueRow[]> {
  const { data } = await admin
    .from("events")
    .select("session_id, name, ok, metrics")
    .gte("ts", sinceIso)
    .in("name", ["enhance_started", "enhance_completed", "checkout_started"])
    .limit(100_000);

  const runs = new Map<string, { started: number; completed: number; sessions: Set<string> }>();
  const upgradeSessions = new Set<string>();
  for (const r of data ?? []) {
    const name = String(r.name);
    const session = String(r.session_id ?? "");
    if (name === "checkout_started") {
      if (session) upgradeSessions.add(session);
      continue;
    }
    const metrics = (r as { metrics?: Record<string, unknown> | null }).metrics ?? {};
    const capsRaw = metrics?.capabilities ?? metrics?.stages;
    const caps = Array.isArray(capsRaw) ? capsRaw.map(String) : [];
    for (const c of caps) {
      const bucket = runs.get(c) ?? { started: 0, completed: 0, sessions: new Set<string>() };
      if (name === "enhance_started") bucket.started++;
      else if (name === "enhance_completed") bucket.completed++;
      if (session) bucket.sessions.add(session);
      runs.set(c, bucket);
    }
  }
  const out: CapabilityValueRow[] = [];
  for (const [id, b] of runs.entries()) {
    let attr = 0;
    for (const s of b.sessions) if (upgradeSessions.has(s)) attr++;
    out.push({
      id,
      runs: b.started,
      upgradeAttributions: attr,
      completionRate: b.started ? b.completed / b.started : 0,
    });
  }
  return out.sort((a, b) => b.runs - a.runs);
}
