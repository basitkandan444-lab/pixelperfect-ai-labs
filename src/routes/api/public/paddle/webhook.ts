import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/paddle/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getWebhookSecret, verifyWebhookSignature } = await import("@/lib/paddle.server");

        let secret: string;
        try {
          secret = getWebhookSecret();
        } catch (err) {
          console.error("[paddle-webhook] billing not configured", err);
          return new Response("webhook not configured", { status: 500 });
        }

        const signature = request.headers.get("paddle-signature");
        if (!signature) return new Response("missing paddle-signature", { status: 400 });

        const rawBody = await request.text();

        const isValid = await verifyWebhookSignature(signature, rawBody, secret);
        if (!isValid) {
          console.error("[paddle-webhook] signature verification failed");
          return new Response("invalid signature", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch (err) {
          return new Response("invalid json", { status: 400 });
        }

        const eventType = payload.event_type;
        const data = payload.data;

        console.log(`[paddle-webhook] Received event: ${eventType}`, data);

        try {
          switch (eventType) {
            case "transaction.completed":
            case "transaction.paid": {
              const userId = data.custom_data?.user_id;
              const plan = data.custom_data?.plan;
              const customerId = data.customer_id;
              const subscriptionId = data.subscription_id || null;

              if (!userId) {
                console.warn("[paddle-webhook] transaction has no user_id in custom_data");
                break;
              }

              if (plan === "lifetime") {
                await upsertSubscription(supabaseAdmin, {
                  user_id: userId,
                  paddle_customer_id: customerId,
                  paddle_subscription_id: null,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: null,
                  plan: "lifetime",
                  status: "active",
                  current_period_end: null,
                });
              } else if (subscriptionId) {
                // Initial transaction activation
                await upsertSubscription(supabaseAdmin, {
                  user_id: userId,
                  paddle_customer_id: customerId,
                  paddle_subscription_id: subscriptionId,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscriptionId,
                  plan: plan || "premium",
                  status: "active",
                  current_period_end: null, // will be updated by subscription events
                });
              }
              break;
            }

            case "subscription.created":
            case "subscription.updated":
            case "subscription.canceled": {
              const customerId = data.customer_id;
              const subscriptionId = data.id;
              const userId = data.custom_data?.user_id;
              const plan = data.custom_data?.plan;
              const status = data.status; // active, trialing, paused, canceled
              const endsAt = data.current_billing_period?.ends_at || null;

              let resolvedUserId = userId;
              if (!resolvedUserId) {
                const { data: existing } = await supabaseAdmin
                  .from("subscriptions")
                  .select("user_id")
                  .eq("paddle_customer_id", customerId)
                  .maybeSingle();
                resolvedUserId = existing?.user_id ?? null;
              }

              if (!resolvedUserId) {
                console.warn("[paddle-webhook] no user_id for subscription", subscriptionId);
                break;
              }

              await upsertSubscription(supabaseAdmin, {
                user_id: resolvedUserId,
                paddle_customer_id: customerId,
                paddle_subscription_id: subscriptionId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                plan: plan || "premium",
                status: eventType === "subscription.canceled" ? "canceled" : status,
                current_period_end: endsAt ? new Date(endsAt).toISOString() : null,
              });
              break;
            }

            default:
              console.log(`[paddle-webhook] event type ${eventType} ignored`);
              break;
          }
        } catch (err) {
          console.error("[paddle-webhook] handler error", err);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: {
    user_id: string;
    paddle_customer_id: string | null;
    paddle_subscription_id: string | null;
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
