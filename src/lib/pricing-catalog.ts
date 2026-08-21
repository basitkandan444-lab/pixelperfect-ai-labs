/**
 * Canonical Pricing & Plan Catalog for Pixel Perfect Pro.
 * Single source of truth across Backend, Server Functions, and Frontend UI.
 */

export const PADDLE_PLANS = {
  monthly: {
    id: "monthly" as const,
    name: "Premium Monthly",
    priceId: "pri_01m0hb7v999jzrzygjvq6qhg3w",
    sandboxPriceId: "pri_01kzc5gzvfz02gfgh1pf4x6t92",
    unitAmount: 399, // $3.99 in cents
    formattedPrice: "$3.99",
    cadence: "per month",
    mode: "subscription" as const,
    interval: "month" as const,
    productName: "Pixel Perfect Pro Premium (Monthly)",
    description: "Flexible monthly billing for active creators.",
    features: [
      "100 ultra-quality image enhancements per month",
      "AI-powered neural upscaling & restoration",
      "Privacy-first browser-side processing",
      "8K resolution export support",
      "Priority GPU processing pipeline",
      "Continuous feature & model updates",
      "Cancel anytime without lock-in",
    ],
  },
  yearly: {
    id: "yearly" as const,
    name: "Premium Yearly",
    priceId: "pri_01m0hbbwxjs70vmzbp476s7gx5",
    sandboxPriceId: "pri_01kzc3m5305adhjcnmf8prrazy",
    unitAmount: 3773, // $37.73 in cents
    formattedPrice: "$37.73",
    cadence: "per year",
    mode: "subscription" as const,
    interval: "year" as const,
    productName: "Pixel Perfect Pro Premium (Yearly)",
    description: "Best annual value — roughly $3.14/month billed annually.",
    features: [
      "100 ultra-quality image enhancements per month",
      "AI-powered neural upscaling & restoration",
      "Privacy-first browser-side processing",
      "8K resolution export support",
      "Priority GPU processing pipeline",
      "Continuous feature & model updates",
      "Save 21% compared to monthly",
      "Cancel anytime",
    ],
  },
  lifetime: {
    id: "lifetime" as const,
    name: "Premium Lifetime",
    priceId: "pri_01m0hbgj6kvb8vqhwjzef1yn6p",
    sandboxPriceId: "pri_01kzc3rk1rfaw8qwc15cdbhnbn",
    unitAmount: 9989, // $99.89 in cents
    formattedPrice: "$99.89",
    cadence: "one-time payment",
    mode: "payment" as const,
    interval: null,
    productName: "Pixel Perfect Pro Premium (Lifetime)",
    description: "One single payment for lifetime access and unlimited updates.",
    features: [
      "100 ultra-quality image enhancements every month for life",
      "AI-powered neural upscaling & restoration",
      "Privacy-first browser-side processing",
      "8K resolution export support",
      "Highest priority GPU processing pipeline",
      "All future major models & features included",
      "No recurring fees ever",
    ],
  },
} as const;

export type PaddlePlanKey = keyof typeof PADDLE_PLANS;
export type PaddlePlanSpec = (typeof PADDLE_PLANS)[PaddlePlanKey];

export function isPaddlePlan(value: unknown): value is PaddlePlanKey {
  return value === "monthly" || value === "yearly" || value === "lifetime";
}

export function getPlanSpec(plan: PaddlePlanKey): PaddlePlanSpec {
  return PADDLE_PLANS[plan];
}
