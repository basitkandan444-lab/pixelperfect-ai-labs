import Stripe from "stripe";

let cached: Stripe | null = null;

/** Thrown when Stripe billing is unreachable due to server misconfiguration
 * (missing/invalid env vars) rather than user input. Lets callers show a safe
 * "temporarily unavailable" message instead of a confusing generic error, and
 * lets it be told apart from user-caused failures (declined card, etc.). */
export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/**
 * Non-throwing check of whether billing is fully configured on this
 * deployment. Safe to call from public (unauthenticated) endpoints — it never
 * touches the Stripe API or leaks secret values, just confirms presence/shape.
 */
export function getBillingConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!readEnv("STRIPE_SECRET_KEY")) missing.push("STRIPE_SECRET_KEY");
  if (!readEnv("STRIPE_PRICE_ID")) missing.push("STRIPE_PRICE_ID");
  if (!readEnv("STRIPE_WEBHOOK_SECRET")) missing.push("STRIPE_WEBHOOK_SECRET");
  return { configured: missing.length === 0, missing };
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = readEnv("STRIPE_SECRET_KEY");
  if (!key) {
    throw new BillingConfigError(
      "STRIPE_SECRET_KEY is not configured — Premium checkout is temporarily unavailable",
    );
  }
  // `createFetchHttpClient` is required for edge/Worker runtimes (Cloudflare
  // Workers has no Node `http`/`net` sockets); it also works unchanged on
  // Node, so it is safe to use unconditionally rather than branching on
  // runtime.
  cached = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    // Pin an explicit API version so a Stripe-side upgrade can never silently
    // change response shapes (e.g. `current_period_end` placement) under us.
    apiVersion: "2026-06-24.dahlia",
    maxNetworkRetries: 2,
  });
  return cached;
}

/** Server-only read of the configured subscription price. */
export function getPriceId(): string {
  const priceId = readEnv("STRIPE_PRICE_ID");
  if (!priceId) {
    throw new BillingConfigError(
      "STRIPE_PRICE_ID is not configured — Premium checkout is temporarily unavailable",
    );
  }
  return priceId;
}

/** Server-only read of the webhook signing secret. */
export function getWebhookSecret(): string {
  const secret = readEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    throw new BillingConfigError("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

/**
 * Resolve the public origin to build Stripe success/cancel/return URLs from.
 *
 * Edge platforms (Cloudflare Workers behind Lovable's proxy) can terminate
 * TLS upstream and forward the request to the Worker over an internal scheme,
 * so `new URL(request.url).protocol` is not always trustworthy on its own.
 * Prefer the standard `X-Forwarded-Proto`/`X-Forwarded-Host` pair (set by the
 * platform's edge proxy) when present, and fall back to the request URL.
 * `PUBLIC_APP_ORIGIN` is an optional explicit override for environments where
 * neither can be trusted.
 */
export function getRequestOrigin(request: Request): string {
  const override = readEnv("PUBLIC_APP_ORIGIN");
  if (override) return override.replace(/\/+$/, "");

  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  const protocol = forwardedProto ? `${forwardedProto}:` : url.protocol;
  const host = forwardedHost || url.host;

  if (protocol !== "https:" && url.hostname !== "localhost" && !url.hostname.startsWith("127.")) {
    throw new BillingConfigError("Checkout requires a secure origin");
  }

  return `${protocol}//${host}`;
}
