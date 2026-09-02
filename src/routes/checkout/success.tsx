import { CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { PADDLE_PLANS, isPaddlePlan } from "@/lib/pricing-catalog";
import { getCheckoutOrderDetails } from "@/lib/paddle.server";

export const Route = createFileRoute("/checkout/success")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        // Paddle appends _ptxn (transaction id) to the configured success URL;
        // session_id is kept for compatibility with direct links.
        _ptxn: z.string().max(255).optional(),
        session_id: z.string().max(255).optional(),
      })
      .parse(s),
  head: () => ({
    meta: [
      { title: `Order confirmed — ${SITE.name}` },
      { name: "description", content: "Your Pixel Perfect Pro Premium order is confirmed." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutSuccessPage,
});

function formatMoney(amount: string | undefined, currency: string | undefined) {
  if (!amount || !currency) return null;
  const value = Number(amount) / 100;
  if (!Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function CheckoutSuccessPage() {
  const { _ptxn, session_id: sessionId } = Route.useSearch();
  const transactionId = _ptxn ?? sessionId ?? "";
  const session = useSession();
  const orderFn = useServerFn(getCheckoutOrderDetails);

  const order = useQuery({
    queryKey: ["checkout-order", transactionId],
    queryFn: () => orderFn({ data: { transactionId } }),
    enabled: !!session.data && !!transactionId,
    // Webhook + Paddle state can lag the redirect by a few seconds.
    retry: 3,
    retryDelay: 2000,
  });

  const details = order.data;
  const planSpec = details?.plan && isPaddlePlan(details.plan) ? PADDLE_PLANS[details.plan] : null;

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link to="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
          <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-foreground">
            <Sparkles className="h-3.5 w-3.5 text-background" aria-hidden="true" />
          </span>
          <span className="text-display !text-lg">
            Pixel Perfect <span className="text-muted-foreground font-medium">Pro</span>
          </span>
        </Link>
      </nav>

      <section className="relative z-10 mx-auto max-w-xl px-6 pb-24 pt-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" aria-hidden="true" />
        <h1 className="mt-6 text-display !text-4xl">Payment received.</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Thank you — your Premium upgrade is being activated. Your order details are below.
        </p>

        {!session.data && !session.isPending && (
          <div className="mt-10 rounded-xl border border-border bg-surface-low p-8">
            <p className="text-sm text-muted-foreground">
              Sign in to view your order details and activate Premium on this device.
            </p>
            <Link to="/auth" search={{ next: `/checkout/success?_ptxn=${transactionId}` }}>
              <Button variant="obsidian" className="mt-6 w-full">
                Sign in
              </Button>
            </Link>
          </div>
        )}

        {session.data && order.isPending && (
          <div className="mt-10 flex items-center justify-center gap-3 rounded-xl border border-border bg-surface-low p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading your order…
          </div>
        )}

        {order.isError && (
          <div className="mt-10 rounded-xl border border-border bg-surface-low p-8">
            <p className="text-sm text-muted-foreground">
              We couldn't load the order details yet — payments can take a minute to register.
              Your Premium access activates automatically once confirmed.
            </p>
            <Link to="/pricing" search={{ upgrade: "success", session_id: transactionId }}>
              <Button variant="outline" className="mt-6 w-full">
                Check activation status
              </Button>
            </Link>
          </div>
        )}

        {details && (
          <div className="mt-10 rounded-xl border border-border bg-surface-low p-8 text-left">
            <span className="eyebrow !text-[9px] !text-muted-foreground">Order summary</span>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium">
                  {planSpec?.name ?? details.plan ?? "Premium"}
                </dd>
              </div>
              {formatMoney(details.total, details.currency) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Total charged</dt>
                  <dd className="font-medium">{formatMoney(details.total, details.currency)}</dd>
                </div>
              )}
              {details.items.map((item) => (
                <div key={item.name} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Item</dt>
                  <dd className="font-medium text-right">
                    {item.name} × {item.quantity}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{details.status}</dd>
              </div>
              {details.customerEmail && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Receipt sent to</dt>
                  <dd className="font-medium">{details.customerEmail}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Order reference</dt>
                <dd className="font-mono text-xs text-muted-foreground break-all text-right">
                  {details.transactionId}
                </dd>
              </div>
            </dl>

            <Link to="/" className="block mt-8">
              <Button variant="obsidian" className="w-full">
                Start enhancing
              </Button>
            </Link>
          </div>
        )}

        <p className="mt-8 text-xs text-muted-foreground/60">
          Payments processed by Paddle. A receipt is emailed for every order.
        </p>
      </section>
    </main>
  );
}
