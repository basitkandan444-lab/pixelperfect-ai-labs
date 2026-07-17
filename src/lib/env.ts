// Centralized environment validation.
//
// Two boundaries are validated separately:
//   - Client env (`VITE_*`) ships in the browser bundle and is read from
//     `import.meta.env` at module load.
//   - Server env (secrets like `LOVABLE_API_KEY`) is read from `process.env`
//     ONLY inside a request handler (edge env is injected per-request), never
//     at module scope.
//
// Malformed values fail fast so misconfiguration surfaces immediately instead
// of causing silent, hard-to-debug runtime failures. Optional analytics config
// is non-critical and only warns — it must never take the whole app down.

import { z } from "zod";

// ---- Client (browser-exposed) env -----------------------------------------

const clientSchema = z.object({
  // GA4 measurement IDs look like `G-XXXXXXXXXX`.
  VITE_GA4_ID: z
    .string()
    .regex(/^G-[A-Z0-9]+$/, "VITE_GA4_ID must look like G-XXXXXXXXXX")
    .optional(),
  VITE_CLARITY_ID: z.string().min(1, "VITE_CLARITY_ID cannot be empty").optional(),
  VITE_GSC_VERIFICATION: z.string().min(1, "VITE_GSC_VERIFICATION cannot be empty").optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

function parseClientEnv(): ClientEnv {
  const raw = {
    VITE_GA4_ID: import.meta.env.VITE_GA4_ID as string | undefined,
    VITE_CLARITY_ID: import.meta.env.VITE_CLARITY_ID as string | undefined,
    VITE_GSC_VERIFICATION: import.meta.env.VITE_GSC_VERIFICATION as string | undefined,
  };

  const parsed = clientSchema.safeParse(raw);
  if (!parsed.success) {
    // Analytics/verification config is optional and non-critical: warn loudly
    // in the console but keep the app running with whatever values were given.
    if (typeof console !== "undefined") {
      console.warn("[env] Invalid client environment:", parsed.error.flatten().fieldErrors);
    }
    return raw;
  }
  return parsed.data;
}

export const clientEnv = parseClientEnv();

// ---- Server (secret) env ---------------------------------------------------
//
// The app performs ALL image enhancement in the user's browser, so there are no
// server secrets required for the core product (no AI gateway key, no hosted
// inference credentials). This section is intentionally empty. If a future
// server secret is introduced, validate it here and read it INSIDE a request
// handler (edge env is injected per-request), never at module scope.
