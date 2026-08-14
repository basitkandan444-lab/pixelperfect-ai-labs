import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useSession } from "@/hooks/use-session";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { Button } from "@/components/ui/button";
import { getMyEntitlement } from "@/lib/subscription.functions";
import {
  createPaddleCheckoutSession,
  createPaddleBillingPortalSession,
  finalizePaddleCheckoutSession,
} from "@/lib/paddle.server";

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
      { title: "Premium Plans — Pixel Perfect Pro" },
      {
        name: "description",
        content:
          "Pixel Perfect Pro Premium: $3.99/month, $37.73/year, $99.89 lifetime. 100 ultra-quality image enhancements, AI-powered enhancement, 8K exports, privacy-first processing.",
      },
      { property: "og:title", content: "Premium Plans — Pixel Perfect Pro" },
      {
        property: "og:description",
        content:
          "Premium image enhancement: $3.99/month, $37.73/year, $99.89 lifetime. AI-powered, on-device processing with 8K exports.",
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
  const [pending, setPending] = useState<"monthly" | "yearly" | "lifetime" | "portal" | null>(null);
  const checkout = useServerFn(createPaddleCheckoutSession);
  const portal = useServerFn(createPaddleBillingPortalSession);
  const entitlementFn = useServerFn(getMyEntitlement);
  const finalizeCheckout = useServerFn(finalizePaddleCheckoutSession);

  const sessionQuery = useSession();
  const isSignedIn = !!sessionQuery.data;
  const billingStatus = useBillingStatus();
  const billingAvailable = billingStatus.data?.configured ?? true;

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

  /**
   * Stripe's hosted pages refuse to render inside an iframe (the Lovable
   * preview is an iframe). Escape to the top-level window, and fall back to a
   * new tab when the parent frame is cross-origin and can't be navigated.
   */
  function openExternal(url: string) {
    const inIframe = typeof window !== "undefined" && window.self !== window.top;
    if (!inIframe) {
      window.location.href = url;
      return;
    }
    try {
      if (window.top) {
        window.top.location.href = url;
        return;
      }
    } catch {
      /* cross-origin parent — fall through to new tab */
    }
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) toast.error("Popup blocked — allow popups, or open the app in a new tab to pay.");
  }

  async function onManage() {
    try {
      setPending("portal");
      const { url } = await portal({});
      if (url) openExternal(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portal failed");
    } finally {
      setPending(null);
    }
  }

  async function onUpgrade(plan: "monthly" | "yearly" | "lifetime") {
    if (!isSignedIn) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }

    try {
      setPending(plan);
      const checkoutResult = await checkout({ data: { plan } });

      if (checkoutResult?.url) openExternal(checkoutResult.url);
      else toast.error("Checkout URL missing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
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
        <Link to="/" className="font-serif text-xl tracking-tight">
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
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Premium plans</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] md:text-7xl">
            Unlock the full potential.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/60 md:text-lg">
            Choose the plan that powers your creativity without boundaries.
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
            <p>We couldn't verify this checkout yet. Your payment status remains safe.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={finalization.isFetching}
              onClick={() => void finalization.refetch()}
            >
              {finalization.isFetching ? "Checking…" : "Check payment again"}
            </Button>
          </div>
        )}
        {upgrade === "cancelled" && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/70">
            Checkout cancelled — no charge was made.
          </div>
        )}
        {!billingAvailable && (
          <div
            role="status"
            className="mx-auto mt-8 max-w-xl rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center text-sm text-amber-100"
          >
            Premium checkout is temporarily unavailable. The Free plan works as usual — please try
            upgrading again shortly.
          </div>
        )}

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <Plan
            name="Premium Monthly"
            price="$3.99"
            cadence="per month"
            highlight={isPremium && entitlement.data?.plan === "monthly"}
            features={[
              "100 ultra-quality image enhancements per month",
              "AI-powered image enhancement",
              "Privacy-first browser processing",
              "High-quality exports",
              "8K export support",
              "Priority processing pipeline",
              "Access to latest enhancement improvements",
              "Cancel anytime",
            ]}
            cta={
              isPremium ? (
                <button
                  onClick={() => void onManage()}
                  disabled={pending === "portal"}
                  className="block w-full rounded-full border border-white/15 bg-white/10 py-3 text-center text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-60"
                >
                  {pending === "portal" ? "Opening…" : "Manage subscription"}
                </button>
              ) : (
                <button
                  onClick={() => void onUpgrade("monthly")}
                  disabled={pending !== null}
                  className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                  {pending === "monthly"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Subscribe — $3.99/month"
                      : "Sign in to subscribe"}
                </button>
              )
            }
            footnote={
              isPremium ? "Active — thank you 🖤" : "Powered by Paddle (Monthly plan not in Stripe)"
            }
          />

          <Plan
            name="Premium Yearly"
            price="$37.73"
            cadence="per year"
            badge="BEST VALUE"
            accent
            highlight={isPremium && entitlement.data?.plan === "yearly"}
            features={[
              "Everything in Premium Monthly",
              "100 ultra-quality image enhancements per month",
              "Full yearly access",
              "All premium AI enhancement engines",
              "Faster processing priority",
              "8K exports",
              "Future feature updates included",
              "Best savings compared with monthly",
            ]}
            cta={
              isPremium ? (
                <button
                  onClick={() => void onManage()}
                  disabled={pending === "portal"}
                  className="block w-full rounded-full border border-white/15 bg-white/10 py-3 text-center text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-60"
                >
                  {pending === "portal" ? "Opening…" : "Manage subscription"}
                </button>
              ) : (
                <button
                  onClick={() => void onUpgrade("yearly")}
                  disabled={pending !== null}
                  className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                  {pending === "yearly"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Subscribe — $37.73/yr"
                      : "Sign in to subscribe"}
                </button>
              )
            }
            footnote={isPremium ? "Active — thank you 🖤" : "Powered by Paddle"}
          />

          <Plan
            name="Lifetime Founder Access"
            price="$99.89"
            cadence="one-time payment"
            badge="LIFETIME"
            highlight={entitlement.data?.plan === "lifetime"}
            features={[
              "Lifetime access to Pixel Perfect Pro",
              "All future software updates included",
              "All future enhancement improvements included",
              "Premium AI tools",
              "8K exports",
              "Priority pipeline",
              "50 ultra-quality image enhancements per month",
              "No recurring payments",
              "Founder access benefits",
            ]}
            cta={
              isPremium ? (
                <div className="block w-full rounded-full border border-white/10 bg-white/5 py-3 text-center text-sm text-white/60">
                  {entitlement.data?.plan === "lifetime"
                    ? "You own this"
                    : "Premium already active"}
                </div>
              ) : (
                <button
                  onClick={() => void onUpgrade("lifetime")}
                  disabled={pending !== null}
                  className="block w-full rounded-full border border-white/25 bg-white/10 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
                >
                  {pending === "lifetime"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Buy lifetime — $99.89"
                      : "Sign in to buy"}
                </button>
              )
            }
            footnote="Lifetime access with founder benefits"
          />
        </div>

        <p className="mt-10 text-center text-xs text-white/40">
          Prices in USD. Sales tax may apply. Payments processed by Paddle. Yearly plans can be
          cancelled anytime — access continues to the end of the paid year. Lifetime is a single
          one-time payment.
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
  badge,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  cta: React.ReactNode;
  footnote?: string;
  accent?: boolean;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative rounded-3xl border p-8 backdrop-blur transition ${
        highlight
          ? "border-white/25 bg-white/[0.07] shadow-[0_0_60px_-12px_rgba(10,132,255,0.35)]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 right-6 rounded-full bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-black">
          {badge}
        </span>
      )}
      {accent && (
        <span className="absolute -top-3 left-6 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/90 backdrop-blur">
          Recommended
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-2xl">{name}</h3>
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
