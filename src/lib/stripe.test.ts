// src/lib/stripe.test.ts
import { describe, it, expect, beforeEach } from "vitest";

import { getBillingConfigStatus } from "./stripe.server";

describe("getBillingConfigStatus", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns configured=false and missing=[STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] when neither is present", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const result = getBillingConfigStatus();

    expect(result.configured).toBe(false);
    expect(result.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  });

  it("returns configured=false and missing=[STRIPE_WEBHOOK_SECRET] when only STRIPE_SECRET_KEY is present", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_secret_key";
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const result = getBillingConfigStatus();

    expect(result.configured).toBe(false);
    expect(result.missing).toEqual(["STRIPE_WEBHOOK_SECRET"]);
  });

  it("returns configured=false and missing=[STRIPE_SECRET_KEY] when only STRIPE_WEBHOOK_SECRET is present", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_webhook_secret";
    delete process.env.STRIPE_SECRET_KEY;

    const result = getBillingConfigStatus();

    expect(result.configured).toBe(false);
    expect(result.missing).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("returns configured=true and empty missing when both secrets are present", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_secret_key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_webhook_secret";

    const result = getBillingConfigStatus();

    expect(result.configured).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
