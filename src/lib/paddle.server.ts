import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_CAP } from "@/lib/entitlement";

/**
 * The premium plan catalog for Paddle.
 * Monthly ($3.99), Yearly ($37.73), and Lifetime ($99.89) plans.
 */
export const PADDLE_PLANS = {
  monthly: {
    priceId: "pri_01kzc5gzvfz02gfgh1pf4x6t92",
    unitAmount: 399, // $3.99 in cents
    interval: "month" as const,
    mode: "subscription" as const,
    productName: "Pixel Perfect Pro Premium (Monthly)",
  },
  yearly: {
    priceId: "pri_01kzc3m5305adhjcnmf8prrazy",
    unitAmount: 3773, // $37.73 in cents
    interval: "year" as const,
    mode: "subscription" as const,
    productName: "Pixel Perfect Pro Premium (Yearly)",
  },
  lifetime: {
    priceId: "pri_01kzc3rk1rfaw8qwc15cdbhnbn",
    unitAmount: 9989, // $99.89 in cents
    interval: null,
    mode: "payment" as const,
    productName: "Pixel Perfect Pro Premium (Lifetime)",
  },
} as const;

export type PaddlePlan = keyof typeof PADDLE_PLANS;

export function isPaddlePlan(value: unknown): value is PaddlePlan {
  return value === "monthly" || value === "yearly" || value === "lifetime";
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

    // Reuse an existing customer if we've already created one for this user.
    const { data: existing } = await supabase
      .from("subscriptions")
      // @ts-ignore
      .select("paddle_customer_id, status, current_period_end")
      .eq("user_id", userId)
      // @ts-ignore
      .not("paddle_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingIsActive =
      existing &&
      (existing.status === "active" || existing.status === "trialing") &&
      (!existing.current_period_end ||
        new Date(existing.current_period_end).getTime() > Date.now());
    if (existingIsActive) throw new Error("Premium is already active for this account");

    // @ts-ignore
    let customerId = existing?.paddle_customer_id ?? undefined;
    if (!customerId) {
      const customer = await createCustomer({
        email: claims.email as string | undefined,
        custom_data: { user_id: userId },
      });
      customerId = customer.id;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: customerStoreError } = await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: userId,
          // @ts-ignore
          paddle_customer_id: customerId,
          plan: "free",
          status: "free",
        },
        { onConflict: "user_id" },
      );
      if (customerStoreError) throw new Error("Could not initialize billing profile");
    }

    if (!customerId) {
      throw new Error("Could not find or create customer");
    }

    const transaction = await createCheckoutSession({
      customer_id: customerId,
      items: [{ price_id: spec.priceId, quantity: 1 }],
      custom_data: { user_id: userId, plan },
    });

    if (!transaction.url) throw new Error("Paddle did not return a checkout URL");
    return { url: transaction.url, sessionId: transaction.id, plan };
  });

/**
 * Open a Paddle Billing Portal session so the user can manage / cancel.
 */
export const createPaddleBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      // @ts-ignore
      .select("paddle_customer_id")
      .eq("user_id", userId)
      // @ts-ignore
      .not("paddle_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // @ts-ignore
    if (!sub?.paddle_customer_id) throw new Error("No Paddle customer on file");

    const billingPortal = await createBillingPortalSession({
      // @ts-ignore
      customer_id: sub.paddle_customer_id,
    });
    return { url: billingPortal.urls.overview };
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
    const { data: sub } = await supabase
      .from("subscriptions")
      // @ts-ignore
      .select("plan, status, current_period_end, paddle_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    const isActive =
      sub &&
      (sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "completed" ||
        sub.status === "paid") &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());

    if (isActive) {
      // @ts-ignore
      return { activated: true, plan: sub.plan, subscriptionId: sub.paddle_subscription_id };
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
    throw new Error("Checkout requires a secure origin");
  }

  return `${protocol}//${host}`;
}

/**
 * Create a Paddle customer.
 */
export async function createCustomer(data: {
  email?: string;
  name?: string;
  custom_data?: Record<string, unknown>;
}) {
  const apiKey = process.env.PADDLE_SANDBOX_API_KEY;
  if (!apiKey) throw new Error("PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch("https://sandbox-api.paddle.com/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Paddle customer creation failed: ${error}`);
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
  const apiKey = process.env.PADDLE_SANDBOX_API_KEY;
  if (!apiKey) throw new Error("PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch("https://sandbox-api.paddle.com/transactions", {
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
    const error = await response.text();
    throw new Error(`Paddle checkout session creation failed: ${error}`);
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
  const secret = process.env.PADDLE_SANDBOX_WEBHOOK_SECRET || process.env.PADDLE_WEBHOOK_SECRET;
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
  const apiKey = process.env.PADDLE_SANDBOX_API_KEY;
  if (!apiKey) throw new Error("PADDLE_SANDBOX_API_KEY is not configured");

  const response = await fetch(
    `https://sandbox-api.paddle.com/customers/${data.customer_id}/portal-sessions`,
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
  const apiKey = process.env.PADDLE_SANDBOX_API_KEY || process.env.PADDLE_API_KEY;
  const webhookSecret =
    process.env.PADDLE_SANDBOX_WEBHOOK_SECRET || process.env.PADDLE_WEBHOOK_SECRET;

  if (!apiKey || !apiKey.trim()) missing.push("PADDLE_API_KEY");
  if (!webhookSecret || !webhookSecret.trim()) missing.push("PADDLE_WEBHOOK_SECRET");

  return { configured: missing.length === 0, missing };
}
