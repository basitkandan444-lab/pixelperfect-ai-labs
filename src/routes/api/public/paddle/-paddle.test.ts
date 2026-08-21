import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBillingConfigStatus, verifyWebhookSignature } from "../../../../lib/paddle.server";
import { Route as WebhookRoute } from "./webhook";
import { Route as StatusRoute } from "./status";

// Mock supabaseAdmin
const mockUpsert = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => {
  return {
    supabaseAdmin: {
      from: vi.fn().mockImplementation(() => ({
        upsert: mockUpsert.mockImplementation(() => Promise.resolve({ error: null })),
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
      })),
    },
  };
});

describe("Paddle Billing Integration Test Suite", () => {
  const originalEnv = process.env;
  const testSecret = "pdl_sdbx_secret_12345";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.PADDLE_SANDBOX_WEBHOOK_SECRET = testSecret;
    process.env.PADDLE_SANDBOX_API_KEY = "pdl_sdbx_api_key_12345";
  });

  // Helper to generate a valid signature header
  async function generateSignatureHeader(
    body: string,
    secret: string,
    timestamp: number,
  ): Promise<string> {
    const dataToVerify = `${timestamp}:${body}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(dataToVerify),
    );

    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return `ts=${timestamp};h1=${hashHex}`;
  }

  describe("1. Configuration Probe", () => {
    it("reports configured=true when keys are present", () => {
      const status = getBillingConfigStatus();
      expect(status.configured).toBe(true);
      expect(status.missing).toEqual([]);
    });

    it("reports configured=false with missing variables when they are deleted", () => {
      delete process.env.PADDLE_SANDBOX_API_KEY;
      delete process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;
      delete process.env.PADDLE_API_KEY;
      delete process.env.PADDLE_WEBHOOK_SECRET;

      const status = getBillingConfigStatus();
      expect(status.configured).toBe(false);
      expect(status.missing).toContain("PADDLE_API_KEY");
      expect(status.missing).toContain("PADDLE_WEBHOOK_SECRET");
    });

    it("verifies GET status route handler outputs correct JSON", async () => {
      const response = await (
        StatusRoute.options as unknown as { server: { handlers: { GET: () => Promise<Response> } } }
      ).server.handlers.GET();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.configured).toBe(true);
    });
  });

  describe("2. Webhook Signature Verification", () => {
    it("successfully verifies a valid signature within the 5-minute window", async () => {
      const body = JSON.stringify({ test: true });
      const now = Math.floor(Date.now() / 1000);
      const signature = await generateSignatureHeader(body, testSecret, now);

      const isValid = await verifyWebhookSignature(signature, body, testSecret);
      expect(isValid).toBe(true);
    });

    it("fails verification if the signature is invalid/tampered", async () => {
      const body = JSON.stringify({ test: true });
      const now = Math.floor(Date.now() / 1000);
      const signature = await generateSignatureHeader(body, testSecret, now);

      // Tamper with body
      const isValid = await verifyWebhookSignature(signature, body + "tampered", testSecret);
      expect(isValid).toBe(false);
    });

    it("fails verification if timestamp is older than 5 minutes", async () => {
      const body = JSON.stringify({ test: true });
      const oldTime = Math.floor(Date.now() / 1000) - 301; // 5 min 1 sec ago
      const signature = await generateSignatureHeader(body, testSecret, oldTime);

      const isValid = await verifyWebhookSignature(signature, body, testSecret);
      expect(isValid).toBe(false);
    });
  });

  describe("3. Webhook Handler Scenarios", () => {
    async function postWebhook(payload: object) {
      const rawBody = JSON.stringify(payload);
      const now = Math.floor(Date.now() / 1000);
      const signature = await generateSignatureHeader(rawBody, testSecret, now);

      const request = new Request("http://localhost/api/public/paddle/webhook", {
        method: "POST",
        headers: {
          "paddle-signature": signature,
          "content-type": "application/json",
        },
        body: rawBody,
      });

      return await (
        WebhookRoute.options as unknown as {
          server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers.POST({ request });
    }

    it("processes transaction.completed successfully for a monthly plan", async () => {
      const payload = {
        event_type: "transaction.completed",
        data: {
          customer_id: "ct_01monthly",
          subscription_id: "sub_01monthly",
          custom_data: {
            user_id: "user_monthly_123",
            plan: "monthly",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_monthly_123",
          paddle_customer_id: "ct_01monthly",
          paddle_subscription_id: "sub_01monthly",
          plan: "monthly",
          status: "active",
          current_period_end: null,
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes transaction.completed successfully for a yearly plan", async () => {
      const payload = {
        event_type: "transaction.completed",
        data: {
          customer_id: "ct_02yearly",
          subscription_id: "sub_02yearly",
          custom_data: {
            user_id: "user_yearly_123",
            plan: "yearly",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_yearly_123",
          paddle_customer_id: "ct_02yearly",
          paddle_subscription_id: "sub_02yearly",
          plan: "yearly",
          status: "active",
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes transaction.completed successfully for a lifetime plan", async () => {
      const payload = {
        event_type: "transaction.completed",
        data: {
          customer_id: "ct_03lifetime",
          custom_data: {
            user_id: "user_lifetime_123",
            plan: "lifetime",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_lifetime_123",
          paddle_customer_id: "ct_03lifetime",
          paddle_subscription_id: null,
          plan: "lifetime",
          status: "active",
          current_period_end: null,
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes subscription.updated successfully", async () => {
      const payload = {
        event_type: "subscription.updated",
        data: {
          id: "sub_01monthly",
          customer_id: "ct_01monthly",
          status: "active",
          custom_data: {
            user_id: "user_monthly_123",
            plan: "monthly",
          },
          current_billing_period: {
            ends_at: "2026-09-07T00:00:00Z",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_monthly_123",
          paddle_customer_id: "ct_01monthly",
          paddle_subscription_id: "sub_01monthly",
          plan: "monthly",
          status: "active",
          current_period_end: new Date("2026-09-07T00:00:00Z").toISOString(),
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes subscription.canceled immediately with canceled status", async () => {
      const payload = {
        event_type: "subscription.canceled",
        data: {
          id: "sub_01monthly",
          customer_id: "ct_01monthly",
          status: "canceled",
          custom_data: {
            user_id: "user_monthly_123",
            plan: "monthly",
          },
          current_billing_period: {
            ends_at: "2026-09-07T00:00:00Z",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_monthly_123",
          paddle_subscription_id: "sub_01monthly",
          status: "canceled",
          current_period_end: new Date("2026-09-07T00:00:00Z").toISOString(),
        }),
        { onConflict: "user_id" },
      );
    });

    it("handles updates where status is past_due (representing payment failure)", async () => {
      const payload = {
        event_type: "subscription.updated",
        data: {
          id: "sub_01monthly",
          customer_id: "ct_01monthly",
          status: "past_due",
          custom_data: {
            user_id: "user_monthly_123",
            plan: "monthly",
          },
          current_billing_period: {
            ends_at: "2026-09-07T00:00:00Z",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_monthly_123",
          paddle_subscription_id: "sub_01monthly",
          status: "past_due",
        }),
        { onConflict: "user_id" },
      );
    });

    it("resolves user_id from the database when it is not present in the webhook custom_data", async () => {
      // Mock database lookup for user_id
      mockMaybeSingle.mockResolvedValueOnce({
        data: { user_id: "resolved_user_456" },
        error: null,
      });

      const payload = {
        event_type: "subscription.updated",
        data: {
          id: "sub_01monthly",
          customer_id: "ct_01monthly",
          status: "active",
          custom_data: {}, // empty custom data
          current_billing_period: {
            ends_at: "2026-09-07T00:00:00Z",
          },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "resolved_user_456",
          paddle_subscription_id: "sub_01monthly",
          status: "active",
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes subscription.resumed and subscription.activated successfully", async () => {
      const payload = {
        event_type: "subscription.resumed",
        data: {
          id: "sub_01resumed",
          customer_id: "ct_01resumed",
          status: "active",
          custom_data: { user_id: "user_resumed_123", plan: "monthly" },
          current_billing_period: { ends_at: "2026-10-01T00:00:00Z" },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_resumed_123",
          paddle_subscription_id: "sub_01resumed",
          status: "active",
        }),
        { onConflict: "user_id" },
      );
    });

    it("processes subscription.paused successfully", async () => {
      const payload = {
        event_type: "subscription.paused",
        data: {
          id: "sub_01paused",
          customer_id: "ct_01paused",
          status: "paused",
          custom_data: { user_id: "user_paused_123", plan: "monthly" },
          current_billing_period: { ends_at: "2026-10-01T00:00:00Z" },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_paused_123",
          paddle_subscription_id: "sub_01paused",
          status: "paused",
        }),
        { onConflict: "user_id" },
      );
    });

    it("resolves user_id via paddle_subscription_id when customer_id lookup fails", async () => {
      // First lookup by paddle_customer_id returns null, second lookup by paddle_subscription_id succeeds
      mockMaybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { user_id: "user_from_sub_id" }, error: null });

      const payload = {
        event_type: "subscription.updated",
        data: {
          id: "sub_fallback_999",
          customer_id: "ct_unknown_999",
          status: "active",
          custom_data: {},
          current_billing_period: { ends_at: "2026-11-01T00:00:00Z" },
        },
      };

      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user_from_sub_id",
          paddle_subscription_id: "sub_fallback_999",
        }),
        { onConflict: "user_id" },
      );
    });

    it("rejects request if signature header is missing", async () => {
      const rawBody = JSON.stringify({ event_type: "transaction.completed" });
      const request = new Request("http://localhost/api/public/paddle/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const res = await (
        WebhookRoute.options as unknown as {
          server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers.POST({ request });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("missing paddle-signature");
    });

    it("rejects request if signature verification fails", async () => {
      const rawBody = JSON.stringify({ event_type: "transaction.completed" });
      const request = new Request("http://localhost/api/public/paddle/webhook", {
        method: "POST",
        headers: {
          "paddle-signature": "ts=12345;h1=badsignature",
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const res = await (
        WebhookRoute.options as unknown as {
          server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
        }
      ).server.handlers.POST({ request });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("invalid signature");
    });
  });
});
