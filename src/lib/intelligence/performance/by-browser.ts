// Per-browser performance aggregation using enhance_completed durations.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface BrowserPerfRow {
  browser: string;
  p95Ms: number;
  baselineP95Ms: number;
  sample: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export async function aggregateBrowserPerf(
  admin: SupabaseClient<Database>,
  sinceIso: string,
): Promise<BrowserPerfRow[]> {
  const { data } = await admin
    .from("events")
    .select("duration_ms, metrics")
    .eq("name", "enhance_completed")
    .gte("ts", sinceIso)
    .limit(50_000);
  const byBrowser = new Map<string, number[]>();
  for (const r of data ?? []) {
    const dur = Number(r.duration_ms) || 0;
    if (dur <= 0) continue;
    const metrics = (r as { metrics?: Record<string, unknown> | null }).metrics ?? {};
    const browser = String(metrics?.browser ?? "unknown");
    const arr = byBrowser.get(browser) ?? [];
    arr.push(dur);
    byBrowser.set(browser, arr);
  }
  const allDur: number[] = [];
  for (const arr of byBrowser.values()) allDur.push(...arr);
  allDur.sort((a, b) => a - b);
  const baseline = percentile(allDur, 0.95);
  const out: BrowserPerfRow[] = [];
  for (const [browser, arr] of byBrowser.entries()) {
    arr.sort((a, b) => a - b);
    out.push({
      browser,
      p95Ms: percentile(arr, 0.95),
      baselineP95Ms: baseline,
      sample: arr.length,
    });
  }
  return out.sort((a, b) => b.sample - a.sample);
}
