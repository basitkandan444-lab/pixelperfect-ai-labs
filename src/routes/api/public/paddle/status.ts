import { createFileRoute } from "@tanstack/react-router";

import { jsonOk } from "@/lib/api-response";
import { getBillingConfigStatus } from "@/lib/paddle.server";

// Public, unauthenticated config probe. Tells the pricing page whether Paddle
// checkout is configured on this deployment.
export const Route = createFileRoute("/api/public/paddle/status")({
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
