// Conversion funnel aggregation over `events`. Bounded window, aggregate-only
// output — never returns user_id / email.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export interface ConversionAggregate {
  uploads: number;
  enhancements: number;
  downloads: number;
  wallHits: number;
  wallAbandons: number;
  checkoutStarted: number;
  checkoutCompleted: number;
}

export async function aggregateConversion(
  admin: SupabaseClient<Database>,
  sinceIso: string,
): Promise<ConversionAggregate> {
  const { data } = await admin
    .from("events")
    .select("name, ok")
    .gte("ts", sinceIso)
    .limit(100_000);
  const rows = data ?? [];
  let uploads = 0, enhancements = 0, downloads = 0, wallHits = 0;
  let wallAbandons = 0, checkoutStarted = 0, checkoutCompleted = 0;
  for (const r of rows) {
    const n = String(r.name);
    if (n === "upload_completed") uploads++;
    else if (n === "enhance_completed") enhancements++;
    else if (n === "download_completed") downloads++;
    else if (n === "feature_interaction" || n === "upgrade_wall_shown") wallHits++;
    else if (n === "enhance_abandoned") wallAbandons++;
    else if (n === "checkout_started") checkoutStarted++;
    else if (n === "checkout_completed") checkoutCompleted++;
  }
  return { uploads, enhancements, downloads, wallHits, wallAbandons, checkoutStarted, checkoutCompleted };
}
