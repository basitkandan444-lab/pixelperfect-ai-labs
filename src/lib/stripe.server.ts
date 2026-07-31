import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  cached = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return cached;
}

/** Server-only read of the configured subscription price. */
export function getPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not configured");
  return priceId;
}

export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Checkout requires a secure origin");
  }
  return url.origin;
}
