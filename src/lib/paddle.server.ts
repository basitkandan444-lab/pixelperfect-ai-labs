import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_CAP } from "@/lib/entitlement";

import {
  PADDLE_PLANS,
  isPaddlePlan,
  type PaddlePlanKey as PaddlePlan,
} from "@/lib/pricing-catalog";

export { PADDLE_PLANS, isPaddlePlan, type PaddlePlan };

const isPaddleLive = () => process.env.PADDLE_ENV === "live";

const getPaddleApiBaseUrl = () =>
  isPaddleLive() ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

const getPaddleApiKey = () => {
  const key = isPaddleLive()
    ? process.env.PADDLE_LIVE_API_KEY
    : process.env.PADDLE_SANDBOX_API_KEY;

  if (!key) {
    throw new Error(
      isPaddleLive()
        ? "[CONFIGURATION] PADDLE_LIVE_API_KEY is not configured"
        : "[CONFIGURATION] PADDLE_SANDBOX_API_KEY is not configured",
    );
  }

  return key;
};

const getPaddleWebhookSecret = () => {
  const secret = isPaddleLive()
    ? process.env.PADDLE_WEBHOOK_SECRET
    : process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      isPaddleLive()
        ? "[CONFIGURATION] PADDLE_WEBHOOK_SECRET is not configured"
        : "[CONFIGURATION] PADDLE_SANDBOX_WEBHOOK_SECRET is not configured",
    );
  }

  return secret;
};

function getPaddlePriceId(plan: PaddlePlan): string {
  const spec = PADDLE_PLANS[plan];
  return isPaddleLive() ? spec.priceId : spec.sandboxPriceId;
}


/**
 * Create a Paddle Checkout (Transaction) Session for a Premium plan.
 * Returns the hosted checkout URL. Requires sign-in.
 */
export const createPaddleCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({ plan: z.enum(["monthly", "yearly", "lifetime"]).default("monthly") })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId, claims } = context;
    const plan = data.plan;
    const spec = PADDLE_PLANS[plan];

    if (!spec) {
      throw new Error(`[CONFIGURATION] Invalid plan requested: ${plan}`);
    }

    // 1. Check existing subscription / customer ID
    let existing: { customerId?: string; status?: string; currentPeriodEnd?: string | null } | null = null;
    try {
      // Try select with * to handle both legacy and migrated schema
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        const custId = d.paddle_customer_id || d.stripe_customer_id;
        if (custId) {
          existing = {
            customerId: custId,
            status: d.status,
            currentPeriodEnd: d.current_period_end,
          };
        }
      }
    } catch (err) {
      console.error("[SUPABASE_SCHEMA] Exception querying subscriptions table:", err);
    }

    const existingIsActive =
      existing &&
      (existing.status === "active" || existing.status === "trialing") &&
      (!existing.currentPeriodEnd ||
        new Date(existing.currentPeriodEnd).getTime() > Date.now());
    if (existingIsActive) {
      throw new Error("Premium is already active for this account");
    }

    // 2. Identify or create Paddle customer
    let customerId = existing?.customerId ?? undefined;
    if (!customerId) {
      try {
        const customer = await createCustomer({
          email: claims.email as string | undefined,
          custom_data: { user_id: userId },
        });
        customerId = customer?.id;
      } catch (err) {
        console.error("[PADDLE_CUSTOMER_CREATE] Failed to create or find customer:", err);
        throw new Error(
          `[PADDLE_CUSTOMER_CREATE] ${err instanceof Error ? err.message : "Failed to establish customer profile"}`,
        );
      }

      if (!customerId) {
        throw new Error("[PADDLE_CUSTOMER_CREATE] Customer ID could not be resolved");
      }

      // Persist customer ID in Supabase with adaptive schema resilience
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const fullRow = {
          user_id: userId,
          paddle_customer_id: customerId,
          stripe_customer_id: customerId,
          plan: "free",
          status: "free",
        };
        let { error: customerStoreError } = await supabaseAdmin.from("subscriptions").upsert(
          fullRow,
          { onConflict: "user_id" },
        );

        if (customerStoreError && (customerStoreError.code === "PGRST204" || customerStoreError.code === "42703")) {
          // Schema fallback without paddle_customer_id column
          const fallbackRow = {
            user_id: userId,
            stripe_customer_id: customerId,
            plan: "free",
            status: "free",
          };
          const fallbackResult = await supabaseAdmin.from("subscriptions").upsert(
            fallbackRow,
            { onConflict: "user_id" },
          );
          customerStoreError = fallbackResult.error;
        }

        if (customerStoreError) {
          console.error("[SUPABASE_WRITE] Failed to persist customer ID:", customerStoreError);
          throw new Error(
            `[SUPABASE_WRITE] Database persistence failed: ${customerStoreError.message}`,
          );
        }
      } catch (err) {
        console.error("[SUPABASE_WRITE] Error persisting customer record:", err);
        throw err;
      }
    }

    // 3. Create checkout transaction
    let transaction;
    try {
      transaction = await createCheckoutSession({
        customer_id: customerId,
        items: [{ price_id: getPaddlePriceId(plan), quantity: 1 }],
        custom_data: { user_id: userId, plan },
      });
    } catch (err) {
      console.error("[PADDLE_TRANSACTION] Transaction creation failed:", err);
      throw new Error(
        `[PADDLE_TRANSACTION] ${err instanceof Error ? err.message : "Failed to create transaction"}`,
      );
    }

    if (!transaction.url) {
      throw new Error("[PADDLE_CHECKOUT] Paddle did not return a checkout URL");
    }

    return { url: transaction.url, sessionId: transaction.id, plan };
  });

/**
 * Open a Paddle Billing Portal session so the user can manage / cancel.
 */
export const createPaddleBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SUPABASE_SCHEMA] Failed to query billing portal customer:", error);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subData = sub as any;
    const customerId = subData?.paddle_customer_id || subData?.stripe_customer_id;

    if (!customerId) {
      throw new Error("[AUTH] No active billing customer found for this account");
    }

    try {
      const billingPortal = await createBillingPortalSession({
        customer_id: customerId,
      });
      return { url: billingPortal.urls.overview };
    } catch (err) {
      console.error("[PADDLE_CHECKOUT] Failed to create billing portal session:", err);
      throw new Error(
        `[PADDLE_CHECKOUT] ${err instanceof Error ? err.message : "Billing portal access failed"}`,
      );
    }
  });

/**
 * Finalize a Paddle checkout session.
 * Polled by client-side to verify database update from the webhook.
 */
export const finalizePaddleCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        sessionId: z.string().trim().max(255),
      })
      .parse(raw),
  )
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[SUPABASE_SCHEMA] Finalize checkout query error:", error);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subData = sub as any;
    const isActive =
      subData &&
      (subData.status === "active" ||
        subData.status === "trialing" ||
        subData.status === "completed" ||
        subData.status === "paid") &&
      (!subData.current_period_end || new Date(subData.current_period_end).getTime() > Date.now());

    if (isActive) {
      const subId = subData.paddle_subscription_id || subData.stripe_subscription_id;
      return { activated: true, plan: subData.plan, subscriptionId: subId };
    }

    return { activated: false };
  });

function getRequestOrigin(request: Request): string {
  const override = process.env.PUBLIC_APP_ORIGIN;
  if (override) return override.replace(/\/+$/, "");

  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  const protocol = forwardedProto ? `${forwardedProto}:` : url.protocol;
  const host = forwardedHost || url.host;

  if (protocol !== "https:" && url.hostname !== "localhost" && !url.hostname.startsWith("127.")) {
    throw new Error("[AUTH] Checkout requires a secure origin");
  }

  return `${protocol}//${host}`;
}

/**
 * Find an existing Paddle customer by email.
 */
async function findCustomerByEmail(email: string) {
  const apiKey = getPaddleApiKey();
  if (!apiKey) throw new Error("[CONFIGURATION] PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch(
    `${getPaddleApiBaseUrl()}/customers?email=${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`[PADDLE_CUSTOMER_LOOKUP] Paddle customer lookup failed: ${error}`);
  }

  const resJson = await response.json();
  return resJson.data?.[0] ?? null;
}

/**
 * Create a Paddle customer.
 */
export async function createCustomer(data: {
  email?: string;
  name?: string;
  custom_data?: Record<string, unknown>;
}) {
  const apiKey = getPaddleApiKey();
  if (!apiKey) throw new Error("[CONFIGURATION] PADDLE_SANDBOX_API_KEY is not configured");

  if (data.email) {
    const existingCustomer = await findCustomerByEmail(data.email);
    if (existingCustomer) return existingCustomer;
  }

  const response = await fetch(`${getPaddleApiBaseUrl()}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Fallback: If customer already exists, attempt lookup again
    if (data.email && (errorText.includes("already_exists") || response.status === 409)) {
      const retryExisting = await findCustomerByEmail(data.email);
      if (retryExisting) return retryExisting;
    }
    throw new Error(`[PADDLE_CUSTOMER_CREATE] Paddle customer creation failed: ${errorText}`);
  }

  const resJson = await response.json();
  return resJson.data;
}

/**
 * Create a Paddle transaction (checkout session equivalent).
 */
export async function createCheckoutSession(data: {
  customer_id: string;
  items: Array<{ price_id: string; quantity: number }>;
  custom_data?: Record<string, unknown>;
}) {
  const apiKey = getPaddleApiKey();
  if (!apiKey) throw new Error("[CONFIGURATION] PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch(`${getPaddleApiBaseUrl()}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      items: data.items,
      customer_id: data.customer_id,
      collection_mode: "automatic",
      custom_data: data.custom_data,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedDetail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.detail) {
        parsedDetail = `${parsed.error.code ? `[${parsed.error.code}] ` : ""}${parsed.error.detail}`;
      }
    } catch {
      // use raw errorText
    }
    throw new Error(`[PADDLE_TRANSACTION] ${parsedDetail}`);
  }

  const resJson = await response.json();
  return {
    url: resJson.data.checkout?.url || null,
    id: resJson.data.id,
  };
}

/**
 * Get the Webhook signature secret.
 */
export function getWebhookSecret(): string {
  const secret = getPaddleWebhookSecret();
  if (!secret) {
    throw new Error("PADDLE_SANDBOX_WEBHOOK_SECRET or PADDLE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

/**
 * Verify Paddle webhook signature using Web Crypto (Worker-safe).
 */
export async function verifyWebhookSignature(
  signatureHeader: string | null,
  rawBody: string,
  secretKey: string,
): Promise<boolean> {
  if (!signatureHeader || !secretKey) return false;

  try {
    const parts = signatureHeader.split(";");
    const tsPart = parts.find((p) => p.startsWith("ts="));
    const h1Part = parts.find((p) => p.startsWith("h1="));

    if (!tsPart || !h1Part) return false;

    const ts = tsPart.split("=")[1];
    const h1 = h1Part.split("=")[1];

    // Verify timestamp within 5 minutes tolerance to protect against replay attacks
    const timestampMs = parseInt(ts, 10) * 1000;
    if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      console.warn("[paddle-webhook] Timestamp outside valid window:", ts);
      return false;
    }

    const dataToVerify = `${ts}:${rawBody}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureBytes = hexToUint8Array(h1);
    const dataBytes = encoder.encode(dataToVerify);

    return await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureBytes as unknown as ArrayBuffer,
      dataBytes,
    );
  } catch (err) {
    console.error("[paddle-webhook] signature verification failed", err);
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Create a Paddle Billing Portal session.
 */
export async function createBillingPortalSession(data: { customer_id: string }) {
  const apiKey = getPaddleApiKey();
  if (!apiKey) throw new Error("PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch(
    `${getPaddleApiBaseUrl()}/customers/${data.customer_id}/portal-sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Paddle billing portal session creation failed: ${error}`);
  }

  const resJson = await response.json();
  return resJson.data;
}

/**
 * Public config status check for Paddle.
 */
export function getBillingConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  const apiKey = isPaddleLive() ? process.env.PADDLE_LIVE_API_KEY : process.env.PADDLE_SANDBOX_API_KEY;
  const webhookSecret = isPaddleLive()
    ? process.env.PADDLE_WEBHOOK_SECRET
    : process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;

  if (!apiKey || !apiKey.trim()) missing.push("PADDLE_API_KEY");
  if (!webhookSecret || !webhookSecret.trim()) missing.push("PADDLE_WEBHOOK_SECRET");

  return { configured: missing.length === 0, missing };
}
