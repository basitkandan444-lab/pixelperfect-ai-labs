import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

function periodEndISO(sub: Stripe.Subscription): string | null {
  // Stripe moved `current_period_end` off the subscription onto its items in
  // recent API versions. Read from either location, whichever the SDK returns.
  const anySub = sub as unknown as { current_period_end?: number };
  const fromSub = typeof anySub.current_period_end === "number" ? anySub.current_period_end : null;
  const fromItem = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const ts = fromSub ?? fromItem?.current_period_end ?? null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/**
 * Stripe webhook handler.
 * - Verifies Stripe-Signature with `constructEventAsync` (Web Crypto — Worker-safe).
 * - Upserts `subscriptions` on checkout.session.completed / customer.subscription.*.
 * - Uses service-role Supabase client so RLS cannot be bypassed by attackers
 *   forging plan changes from the browser.
 * - Endpoint lives under /api/public/* so Lovable auth doesn't intercept it,
 *   but the signature check IS the auth.
 */
export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getStripe, getWebhookSecret, BillingConfigError } =
          await import("@/lib/stripe.server");

        let secret: string;
        let stripe: ReturnType<typeof getStripe>;
        try {
          secret = getWebhookSecret();
          stripe = getStripe();
        } catch (err) {
          // Config errors are an operator problem, not a Stripe protocol
          // problem — respond 500 (not 400) so Stripe retries once the
          // secret is fixed, instead of permanently dropping the event.
          console.error("[stripe-webhook] billing not configured", err);
          return new Response(
            err instanceof BillingConfigError ? err.message : "webhook not configured",
            { status: 500 },
          );
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("missing stripe-signature", { status: 400 });

        const rawBody = await request.text();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed", err);
          return new Response("invalid signature", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId = (session.metadata?.user_id ?? session.client_reference_id) as
                string | undefined;
              const customerId =
                typeof session.customer === "string" ? session.customer : session.customer?.id;
              if (!userId) break;

              // Lifetime plan is a one-time payment — there is no subscription.
              if (session.mode === "payment") {
                if (session.payment_status !== "paid") break;
                await upsertSubscription(supabaseAdmin, {
                  user_id: userId,
                  stripe_customer_id: customerId ?? null,
                  stripe_subscription_id: null,
                  plan: "lifetime",
                  status: "active",
                  current_period_end: null,
                });
                break;
              }

              const subscriptionId =
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id;
              if (!subscriptionId) break;

              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              await upsertSubscription(supabaseAdmin, {
                user_id: userId,
                stripe_customer_id: customerId ?? null,
                stripe_subscription_id: sub.id,
                plan: "premium",
                status: sub.status,
                current_period_end: periodEndISO(sub),
              });

              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const eventSub = event.data.object as Stripe.Subscription;
              const sub =
                event.type === "customer.subscription.deleted"
                  ? eventSub
                  : await stripe.subscriptions.retrieve(eventSub.id);
              const userId = (sub.metadata?.user_id as string | undefined) ?? null;
              const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

              // Resolve user_id from existing row if metadata missing.
              let resolvedUserId = userId;
              if (!resolvedUserId) {
                const { data: existing } = await supabaseAdmin
                  .from("subscriptions")
                  .select("user_id")
                  .eq("stripe_customer_id", customerId)
                  .maybeSingle();
                resolvedUserId = existing?.user_id ?? null;
              }
              if (!resolvedUserId) {
                console.warn("[stripe-webhook] no user_id for subscription", sub.id);
                break;
              }

              await upsertSubscription(supabaseAdmin, {
                user_id: resolvedUserId,
                stripe_customer_id: customerId,
                stripe_subscription_id: sub.id,
                plan: "premium",
                status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
                current_period_end: periodEndISO(sub),
              });

              break;
            }
            default:
              // Ignored — return 200 so Stripe doesn't retry.
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error", err);
          return new Response("handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

async function upsertSubscription(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  row: {
    user_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    plan: string;
    status: string;
    current_period_end: string | null;
  },
) {
  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

// type helper only — never actually called at runtime
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
