import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FREE_CAP = 5;

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
      sub.status === "active" &&
      (!sub.current_period_end || new Date(sub.current_period_end).getTime() > now);
    return {
      isPremium,
      plan: isPremium ? sub!.plan : "free",
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
  .inputValidator((raw) =>
    z
      .object({
        successPath: z.string().startsWith("/").max(256).optional(),
        cancelPath: z.string().startsWith("/").max(256).optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId, claims } = context;
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new Error("STRIPE_PRICE_ID not configured");
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();

    // Reuse an existing customer if we've already created one for this user.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: claims.email as string | undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
    }

    // Derive origin from the request so redirects work in preview + prod.
    const origin =
      getRequestHeader("origin") ??
      (getRequestHeader("host") ? `https://${getRequestHeader("host")}` : "https://pixelperfect-ai-labs.lovable.app");

    const successPath = data.successPath ?? "/pricing?upgrade=success";
    const cancelPath = data.cancelPath ?? "/pricing?upgrade=cancelled";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${successPath}`,
      cancel_url: `${origin}${cancelPath}`,
      allow_promotion_codes: true,
      client_reference_id: userId,
      metadata: { user_id: userId },
      subscription_data: { metadata: { user_id: userId } },
    });

    return { url: session.url, sessionId: session.id };
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
    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();
    const origin =
      getRequestHeader("origin") ??
      (getRequestHeader("host") ? `https://${getRequestHeader("host")}` : "https://pixelperfect-ai-labs.lovable.app");
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/pricing`,
    });
    return { url: portal.url };
  });
