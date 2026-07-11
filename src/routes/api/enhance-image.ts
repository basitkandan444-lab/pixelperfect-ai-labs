import { createFileRoute } from "@tanstack/react-router";

import { handleEnhanceImage } from "@/lib/enhance-image.core";
import { getServerEnv } from "@/lib/env";

// Thin HTTP adapter. All validation, rate limiting, timeout/retry, logging and
// response shaping live in `handleEnhanceImage` (src/lib/enhance-image.core.ts)
// so the logic is unit-testable without the router. Secrets are read inside the
// handler (edge env is injected per-request), never at module scope.

export const Route = createFileRoute("/api/enhance-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { LOVABLE_API_KEY } = getServerEnv();
        return handleEnhanceImage(request, { apiKey: LOVABLE_API_KEY });
      },
    },
  },
});
