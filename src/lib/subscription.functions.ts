import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_CAP } from "@/lib/entitlement";

/**
 * Return the caller's plan status, usage, and premium flag.
 * Anonymous callers get { isPremium: false, used: 0, cap: FREE_CAP, plan: "anon" }.
 */
export const getMyEntitlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: prof }, { data: sub }] = await Promise.all([
      supabase.from("profiles").select("enhancements_used").eq("id", userId).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("plan, status, current_period_end")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const now = Date.now();
    const isPremium =
      !!sub &&
      (sub.status === "active" || sub.status === "trialing") &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > now);
    return {
      isPremium,
      plan: isPremium ? (sub?.plan ?? "free") : "free",
      status: sub?.status ?? "none",
      used: prof?.enhancements_used ?? 0,
      cap: FREE_CAP,
      currentPeriodEnd: sub?.current_period_end ?? null,
    };
  });

/**
 * Consume one free enhancement atomically via the SECURITY DEFINER
 * consume_free_enhancement(user_id, cap) function. Returns { allowed }.
 * Premium users always pass; free users are gated at FREE_CAP.
 */
export const consumeEnhancement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("consume_free_enhancement", {
      _user_id: userId,
      _free_cap: FREE_CAP,
    });
    if (error) throw new Error(error.message);
    return { allowed: !!data, cap: FREE_CAP };
  });

/**
 * Create a Stripe Checkout Session for the $0.99/mo Premium subscription.
 * Returns the hosted checkout URL. Requires sign-in.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { getStripe, getPriceId, getRequestOrigin } = await import("./stripe.server");
    const priceId = getPriceId();
    const stripe = getStripe();

    // Reuse an existing customer if we've already created one for this user.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status, current_period_end")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingIsActive =
      existing &&
      (existing.status === "active" || existing.status === "trialing") &&
      (!existing.current_period_end ||
        new Date(existing.current_period_end).getTime() > Date.now());
    if (existingIsActive) throw new Error("Premium is already active for this account");

    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== 99 ||
      price.recurring?.interval !== "month" ||
      price.type !== "recurring"
    ) {
      throw new Error("Premium billing is temporarily unavailable");
    }

    let customerId = existing?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: claims.email as string | undefined,
          metadata: { user_id: userId },
        },
        { idempotencyKey: `pixel-perfect-customer-${userId}` },
      );
      customerId = customer.id;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: customerStoreError } = await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          plan: "free",
          status: "free",
        },
        { onConflict: "user_id" },
      );
      if (customerStoreError) throw new Error("Could not initialize billing profile");
    }

    const origin = getRequestOrigin(getRequest());

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/pricing?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?upgrade=cancelled`,
        allow_promotion_codes: true,
        client_reference_id: userId,
        metadata: { user_id: userId },
        subscription_data: { metadata: { user_id: userId } },
      },
      { idempotencyKey: `pixel-perfect-checkout-${userId}-${Math.floor(Date.now() / 60_000)}` },
    );

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, sessionId: session.id };
  });

export const finalizeCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        sessionId: z
          .string()
          .trim()
          .regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/)
          .max(255),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    const ownerId = session.metadata?.user_id ?? session.client_reference_id;
    if (ownerId !== context.userId)
      throw new Error("Checkout session does not belong to this account");
    if (session.status !== "complete" || !session.subscription) {
      throw new Error("Checkout is not complete");
    }

    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      throw new Error("Subscription is not active");
    }

    const item = subscription.items.data[0] as unknown as
      { current_period_end?: number } | undefined;
    const legacy = subscription as unknown as { current_period_end?: number };
    const periodEnd = legacy.current_period_end ?? item?.current_period_end;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: context.userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan: "premium",
        status: subscription.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("Could not activate Premium");
    return { activated: true, subscriptionId: subscription.id };
  });

/**
 * Open a Stripe Billing Portal session so the user can manage / cancel.
 */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("No Stripe customer on file");
    const { getStripe, getRequestOrigin } = await import("./stripe.server");
    const stripe = getStripe();
    const origin = getRequestOrigin(getRequest());
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/pricing`,
    });
    return { url: portal.url };
  });
