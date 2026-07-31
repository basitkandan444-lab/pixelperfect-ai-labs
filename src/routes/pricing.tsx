import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useSession } from "@/hooks/use-session";
import {
  createBillingPortalSession,
  createCheckoutSession,
  finalizeCheckoutSession,
  getMyEntitlement,
} from "@/lib/subscription.functions";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        upgrade: z.enum(["success", "cancelled"]).optional(),
        session_id: z.string().max(255).optional(),
      })
      .parse(s),
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Pixel Perfect Pro" },
      {
        name: "description",
        content:
          "Start free with 5 on-device enhancements. Upgrade to Premium for $0.99/month — 100 ultra quality images per month, priority pipeline, 8K exports.",
      },
      { property: "og:title", content: "Pricing — Pixel Perfect Pro" },
      {
        property: "og:description",
        content: "Premium for $0.99/month. 100 ultra quality on-device AI enhancements every month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PricingPage() {
  const { upgrade, session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createBillingPortalSession);
  const entitlementFn = useServerFn(getMyEntitlement);
  const finalizeCheckout = useServerFn(finalizeCheckoutSession);

  const sessionQuery = useSession();
  const isSignedIn = !!sessionQuery.data;

  const finalization = useQuery({
    queryKey: ["checkout-finalization", sessionId],
    queryFn: () => finalizeCheckout({ data: { sessionId: sessionId ?? "" } }),
    enabled: isSignedIn && upgrade === "success" && !!sessionId,
    retry: 2,
  });

  const entitlement = useQuery({
    queryKey: ["entitlement", finalization.data?.subscriptionId],
    queryFn: () => entitlementFn({}),
    enabled: isSignedIn,
    refetchInterval: upgrade === "success" && !finalization.data?.activated ? 2000 : false,
  });

  useEffect(() => {
    if (finalization.data?.activated)
      void queryClient.invalidateQueries({ queryKey: ["entitlement"] });
  }, [finalization.data?.activated, queryClient]);

  const isPremium = entitlement.data?.isPremium ?? false;
  const used = entitlement.data?.used ?? 0;
  const cap = entitlement.data?.cap ?? 5;

  async function onUpgrade() {
    if (!isSignedIn) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    try {
      setPending("checkout");
      const { url } = await checkout({});
      if (url) window.location.href = url;
      else toast.error("Checkout URL missing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setPending(null);
    }
  }

  async function onManage() {
    try {
      setPending("portal");
      const { url } = await portal({});
      if (url) window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portal failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, rgba(10,132,255,0.25) 0%, transparent 60%), radial-gradient(50% 40% at 80% 40%, rgba(155,90,255,0.15) 0%, transparent 60%)",
        }}
      />
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link to="/" className="font-serif text-xl italic tracking-tight">
          Pixel Perfect Pro
        </Link>
        <Link
          to="/"
          className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white/80 backdrop-blur transition hover:bg-white/10"
        >
          ← Back
        </Link>
      </nav>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-8 md:pt-16">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Pricing</p>
          <h1 className="mt-4 font-serif text-5xl italic leading-[1.05] md:text-7xl">
            Beautifully simple.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/60 md:text-lg">
            Enhance on your device. No credits. No queues. Upgrade when you need more.
          </p>
        </header>

        {upgrade === "success" && finalization.isPending && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center text-sm text-emerald-100">
            Payment received. Securely activating Premium…
          </div>
        )}
        {upgrade === "success" && finalization.data?.activated && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center text-sm text-emerald-100">
            Premium is active. Thank you for upgrading.
          </div>
        )}
        {upgrade === "success" && finalization.isError && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-center text-sm text-red-100">
            We couldn't verify this checkout. No account changes were made; please retry from this
            page or manage the payment through Stripe.
          </div>
        )}
        {upgrade === "cancelled" && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/70">
            Checkout cancelled — no charge was made.
          </div>
        )}

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Plan
            name="Free"
            price="$0"
            cadence="forever"
            highlight={!isPremium}
            features={[
              `${cap} on-device enhancements`,
              "Fast classical engine",
              "100% private — nothing leaves the browser",
              "Watermark-free downloads",
            ]}
            cta={
              <Link
                to="/"
                className="block w-full rounded-full border border-white/15 bg-white/5 py-3 text-center text-sm text-white/85 transition hover:bg-white/10"
              >
                Start free
              </Link>
            }
            footnote={isSignedIn ? `${used} / ${cap} used` : "No signup to try"}
          />

          <Plan
            name="Premium"
            price="$0.99"
            cadence="per month"
            accent
            highlight={isPremium}
            features={[
              "100 ultra quality images / month",
              "Balanced neural engine (Real-ESRGAN, on-device)",
              "Priority pipeline",
              "8K exports",
              "Cancel anytime",
            ]}
            cta={
              isPremium ? (
                <button
                  onClick={onManage}
                  disabled={pending === "portal"}
                  className="block w-full rounded-full border border-white/15 bg-white/10 py-3 text-center text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-60"
                >
                  {pending === "portal" ? "Opening…" : "Manage subscription"}
                </button>
              ) : (
                <button
                  onClick={onUpgrade}
                  disabled={pending === "checkout"}
                  className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-black shadow-[0_0_40px_-8px_rgba(10,132,255,0.6)] transition hover:bg-white/90 disabled:opacity-60"
                >
                  {pending === "checkout"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Upgrade — $0.99/mo"
                      : "Sign in to upgrade"}
                </button>
              )
            }
            footnote={isPremium ? "Active — thank you 🖤" : "Secure checkout via Stripe"}
          />
        </div>

        <p className="mt-10 text-center text-xs text-white/40">
          Prices in USD. Sales tax may apply. Payments processed by Stripe. Cancel anytime — access
          continues to the end of the paid period.
        </p>
      </section>
    </main>
  );
}

function Plan({
  name,
  price,
  cadence,
  features,
  cta,
  footnote,
  accent,
  highlight,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  cta: React.ReactNode;
  footnote?: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl border p-8 backdrop-blur transition ${
        highlight
          ? "border-white/25 bg-white/[0.07] shadow-[0_0_60px_-12px_rgba(10,132,255,0.35)]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {accent && (
        <span className="absolute -top-3 right-6 rounded-full bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-black">
          Recommended
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-2xl italic">{name}</h3>
        {highlight && (
          <span className="text-[10px] uppercase tracking-widest text-white/60">Current plan</span>
        )}
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-serif text-5xl">{price}</span>
        <span className="text-sm text-white/50">{cadence}</span>
      </div>
      <ul className="mt-8 space-y-3 text-sm text-white/80">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
      {footnote && <p className="mt-4 text-center text-xs text-white/45">{footnote}</p>}
    </div>
  );
}
