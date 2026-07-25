// Revenue estimator (MRR/ARR bands + LTV) from `subscriptions`.
// Bounded, aggregate-only — no PII returned.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface RevenueAggregate {
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  monthlyRecurringUsd: number;
  annualRecurringUsd: number;
  estimatedLtvUsd: number;
  avgLifetimeMonths: number;
}

const DEFAULT_PRICE_USD = 9;
const AVG_LIFETIME_MONTHS = 6; // conservative bounded default

export async function aggregateRevenue(
  admin: SupabaseClient<Database>,
): Promise<RevenueAggregate> {
  const { data } = await admin
    .from("subscriptions")
    .select("status, current_period_end")
    .limit(50_000);
  const rows = data ?? [];
  let active = 0, cancelled = 0;
  const nowMs = Date.now();
  for (const r of rows) {
    const status = String(r.status ?? "");
    const end = r.current_period_end ? Date.parse(String(r.current_period_end)) : null;
    if (status === "active" && (end === null || end > nowMs)) active++;
    else cancelled++;
  }
  const mrr = active * DEFAULT_PRICE_USD;
  return {
    activeSubscriptions: active,
    cancelledSubscriptions: cancelled,
    monthlyRecurringUsd: mrr,
    annualRecurringUsd: mrr * 12,
    estimatedLtvUsd: DEFAULT_PRICE_USD * AVG_LIFETIME_MONTHS,
    avgLifetimeMonths: AVG_LIFETIME_MONTHS,
  };
}
