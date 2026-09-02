import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_CAP } from "@/lib/entitlement";
import { z } from "zod";


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
 * Create a checkout session via Paddle.
 * Replaces the old createCheckoutSession which used Stripe.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // Hand-rolled validator: this module is imported by the landing page, so
  // pulling Zod in here would ship the whole schema library in the initial
  // client bundle for one three-value enum.
  .validator((data: unknown) => {
    const plan = (data as { plan?: unknown } | null | undefined)?.plan ?? "monthly";
    if (plan !== "monthly" && plan !== "yearly" && plan !== "lifetime") {
      throw new Error("Invalid plan");
    }
    return { plan };
  })

  .handler(async ({ context, data }) => {
    // We import the Paddle-specific server function and call it.
    const { createPaddleCheckoutSession } = await import("@/lib/paddle.server");
    return createPaddleCheckoutSession({ data });
  });

