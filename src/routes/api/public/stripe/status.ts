import { createFileRoute } from "@tanstack/react-router";

import { jsonOk } from "@/lib/api-response";
import { getBillingConfigStatus } from "@/lib/stripe.server";

// Public, unauthenticated, PII-free config probe. Lets the pricing page (and
// uptime monitors) know BEFORE a user clicks "Upgrade" whether checkout can
// possibly succeed, so a misconfigured deployment degrades to a visible
// "temporarily unavailable" banner instead of a broken button that throws
// only after sign-in + a round trip. Never exposes secret values, only which
// named env vars are missing (useful for on-call triage).
export const Route = createFileRoute("/api/public/stripe/status")({
  server: {
    handlers: {
      GET: async () => {
        const { configured, missing } = getBillingConfigStatus();
        return jsonOk(
          { configured, missing },
          { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
        );
      },
    },
  },
});
