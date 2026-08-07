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
 * The premium plan catalog. Only yearly ($37.73) and lifetime ($99.89) plans are supported via Stripe.
 * Monthly ($3.99) plan is handled by Paddle.
 * Yearly Paddle price ID: pri_01kzc3m5305adhjcnmf8prrazy
 * Lifetime Paddle price ID: pri_01kzc3rk1rfaw8qwc15cdbhnbn
 */
export const PREMIUM_PLANS = {
  yearly: {
    lookupKey: "pixel_perfect_premium_yearly_3773_v1",
    unitAmount: 3773,
    interval: "year" as const,
    mode: "subscription" as const,
    productName: "Pixel Perfect Pro Premium (Yearly)",
    envOverride: "STRIPE_PRICE_ID_YEARLY",
    paddlePriceId: "pri_01kzc3m5305adhjcnmf8prrazy",
  },
  lifetime: {
    lookupKey: "pixel_perfect_premium_lifetime_9989_v1",
    unitAmount: 9989,
    interval: null,
    mode: "payment" as const,
    productName: "Pixel Perfect Pro Premium (Lifetime)",
    envOverride: "STRIPE_PRICE_ID_LIFETIME",
    paddlePriceId: "pri_01kzc3rk1rfaw8qwc15cdbhnbn",
  },
} as const;

export type PremiumPlan = keyof typeof PREMIUM_PLANS;

export function isPremiumPlan(value: unknown): value is PremiumPlan {
  return value === "yearly" || value === "lifetime";
}

/**
 * Non-throwing check of whether billing is fully configured on this
 * deployment. Safe to call from public (unauthenticated) endpoints — it never
 * touches the Stripe API or leaks secret values, just confirms presence/shape.
 *
 * Both Stripe secrets are required: the secret key for checkout operations
 * (creating sessions, retrieving customer data) and the webhook secret for
 * secure webhook signature verification. Missing either prevents successful
 * payment processing and webhook reconciliation.
 */
export function getBillingConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!readEnv("STRIPE_SECRET_KEY")) missing.push("STRIPE_SECRET_KEY");
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
    // change response shapes (e.g. current_period_end placement) under us.
    apiVersion: "2026-07-29.dahlia",
    maxNetworkRetries: 2,
  });
  return cached;
}

const priceCache = new Map<PremiumPlan, string>();

/**
 * Resolve the Stripe price for a plan, creating it if the account doesn't have
 * it yet. Order of preference:
 *   1. explicit env override (`STRIPE_PRICE_ID_YEARLY` / `_LIFETIME`)
 *   2. an existing active price carrying our `lookup_key` with the right amount
 *   3. a freshly created product + price stamped with that `lookup_key`
 */
export async function resolvePriceId(stripe: Stripe, plan: PremiumPlan): Promise<string> {
  const cachedId = priceCache.get(plan);
  if (cachedId) return cachedId;

  const spec = PREMIUM_PLANS[plan];

  const override = readEnv(spec.envOverride);
  if (override) {
    priceCache.set(plan, override);
    return override;
  }

  const existing = await stripe.prices.list({
    lookup_keys: [spec.lookupKey],
    active: true,
    limit: 1,
  });
  const match = existing.data[0];
  if (
    match &&
    match.unit_amount === spec.unitAmount &&
    match.currency === "usd" &&
    (spec.interval === null
      ? match.type === "one_time"
      : match.recurring?.interval === spec.interval)
  ) {
    priceCache.set(plan, match.id);
    return match.id;
  }

  const product = await stripe.products.create(
    { name: spec.productName, metadata: { plan } },
    { idempotencyKey: `pixel-perfect-product-${spec.lookupKey}` },
  );

  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: "usd",
      unit_amount: spec.unitAmount,
      lookup_key: spec.lookupKey,
      transfer_lookup_key: true,
      ...(spec.interval ? { recurring: { interval: spec.interval } } : {}),
    },
    { idempotencyKey: `pixel-perfect-price-${spec.lookupKey}` },
  );

  priceCache.set(plan, price.id);
  return price.id;
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
