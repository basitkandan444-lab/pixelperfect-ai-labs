import { useQuery } from "@tanstack/react-query";

type BillingStatusResponse = { success: true; data: { configured: boolean; missing: string[] } };

async function fetchBillingStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch("/api/public/stripe/status", { headers: { accept: "application/json" } });
    // A missing/stale status route, preview proxy failure, or temporary server
    // error must not disable a checkout that may be perfectly healthy. Only a
    // successful, explicit { configured: false } response may block the CTA;
    // the real authenticated checkout remains the source of truth.
    if (!res.ok) return { configured: true };
    const body = (await res.json()) as BillingStatusResponse;
    if (body.success !== true || typeof body.data?.configured !== "boolean") {
      return { configured: true };
    }
    return { configured: body.data.configured };
  } catch {
    // Network failure while probing config should not itself block the CTA —
    // fall back to "assume configured" and let the real checkout attempt
    // surface a precise error if it truly is broken. This avoids a transient
    // network blip permanently hiding a working Upgrade button.
    return { configured: true };
  }
}

/**
 * Public, unauthenticated probe of whether Premium checkout is configured on
 * this deployment. Used to proactively degrade the Upgrade UI (disabled
 * button + explanatory copy) instead of only failing after a user signs in
 * and clicks through — a safer failure mode for a payment flow.
 */
export function useBillingStatus() {
  return useQuery({
    queryKey: ["billing-status"],
    queryFn: fetchBillingStatus,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
