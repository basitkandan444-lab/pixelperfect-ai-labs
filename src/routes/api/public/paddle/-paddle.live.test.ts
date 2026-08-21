import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getWebhookSecret } from "@/lib/paddle.server";
import { Route as WebhookRoute } from "./webhook";

describe("Live Supabase Billing Integration Test", () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  it("successfully persists and reads back billing state against live Supabase", async () => {
    if (!supabaseUrl || !serviceKey) {
      console.warn("Skipping live Supabase test: credentials not provided in environment");
      return;
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const testUserId = "c9f2c2b3-94a0-4c71-8f6e-2b3f729773d1";
    const testPaddleCustomer = "ctm_01kzr7zj97k7w4aj3yhjd91s0w";
    const testPaddleSub = `sub_test_${Date.now()}`;

    // 1. Simulate incoming Paddle webhook
    const secret = getWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({
      event_id: `evt_test_${Date.now()}`,
      event_type: "subscription.activated",
      data: {
        id: testPaddleSub,
        customer_id: testPaddleCustomer,
        status: "active",
        custom_data: { user_id: testUserId, plan: "yearly" },
        current_billing_period: {
          ends_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        },
      },
    });

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(`${timestamp}:${rawBody}`),
    );
    const h1 = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const req = new Request("http://localhost/api/public/paddle/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paddle-signature": `ts=${timestamp};h1=${h1}`,
      },
      body: rawBody,
    });

    // Execute webhook handler
    const webhookHandler = (
      WebhookRoute.options as unknown as {
        server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
      }
    ).server.handlers.POST;

    const res = await webhookHandler({ request: req });
    expect(res.status).toBe(200);

    // 2. Query live database to verify persistence
    const { data: record, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", testUserId)
      .single();

    expect(error).toBeNull();
    expect(record).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = record as any;
    expect(r.plan).toBe("yearly");
    expect(r.status).toBe("active");
    expect(r.paddle_customer_id || r.stripe_customer_id).toBe(testPaddleCustomer);
    expect(r.paddle_subscription_id || r.stripe_subscription_id).toBe(testPaddleSub);
  });
});
