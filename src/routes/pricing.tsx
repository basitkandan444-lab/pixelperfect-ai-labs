import { Check } from "lucide-react";
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
    <main className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, oklch(0.65 0.2 250 / 0.15) 0%, transparent 60%)",
        }}
      />
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link to="/" className="flex items-center gap-2 group" aria-label={`${SITE.name} home`}>
          <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-foreground transition-transform duration-standard group-hover:rotate-[8deg] group-hover:scale-110">
            <Sparkles className="h-3.5 w-3.5 text-background" aria-hidden="true" />
          </span>
          <span className="text-display !text-lg">
            Pixel Perfect <span className="text-muted-foreground font-medium">Pro</span>
          </span>
        </Link>
        <Link
          to="/"
          className="rounded-md border border-border bg-surface-low px-4 py-1.5 eyebrow !text-[9px] !text-muted-foreground transition hover:text-foreground hover:bg-surface-mid"
        >
          ← Back
        </Link>
      </nav>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-8 md:pt-16">
        <header className="text-center">
          <span className="eyebrow !text-primary">Premium plans</span>
          <h1 className="mt-6 text-display !text-[clamp(2.5rem,7vw,5rem)]">
            Unlock the full potential.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Choose the plan that powers your creativity without boundaries.
          </p>
        </header>

        {upgrade === "success" && finalization.isPending && (
          <div className="mx-auto mt-8 max-w-xl rounded-lg border border-primary/30 bg-primary/5 p-4 text-center text-sm text-primary">
            Payment received. Securely activating Premium…
          </div>
        )}
        {upgrade === "success" && finalization.data?.activated && (
          <div className="mx-auto mt-8 max-w-xl rounded-lg border border-primary/30 bg-primary/5 p-4 text-center text-sm text-primary">
            Premium is active. Thank you for upgrading.
          </div>
        )}
        
        <div className="mt-16 grid gap-8 md:grid-cols-3">
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
              "Cancel anytime",
            ]}
            cta={
              isPremium ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void onManage()}
                  disabled={pending === "portal"}
                >
                  {pending === "portal" ? "Opening…" : "Manage subscription"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void onUpgrade("monthly")}
                  disabled={pending !== null}
                >
                  {pending === "monthly"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Subscribe — $3.99/month"
                      : "Sign in to subscribe"}
                </Button>
              )
            }
            footnote={
              isPremium ? "Active — thank you 🖤" : "Powered by Paddle"
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
              "Best savings compared with monthly",
            ]}
            cta={
              isPremium ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void onManage()}
                  disabled={pending === "portal"}
                >
                  {pending === "portal" ? "Opening…" : "Manage subscription"}
                </Button>
              ) : (
                <Button
                  variant="obsidian"
                  className="w-full"
                  onClick={() => void onUpgrade("yearly")}
                  disabled={pending !== null}
                >
                  {pending === "yearly"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Subscribe — $37.73/yr"
                      : "Sign in to subscribe"}
                </Button>
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
              "Premium AI tools",
              "8K exports",
              "Priority pipeline",
              "50 ultra-quality image enhancements per month",
              "No recurring payments",
              "Founder access benefits",
            ]}
            cta={
              isPremium ? (
                <div className="block w-full rounded-md border border-border bg-surface-mid py-3 text-center text-sm font-medium text-muted-foreground">
                  {entitlement.data?.plan === "lifetime"
                    ? "You own this"
                    : "Premium already active"}
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void onUpgrade("lifetime")}
                  disabled={pending !== null}
                >
                  {pending === "lifetime"
                    ? "Opening checkout…"
                    : isSignedIn
                      ? "Buy lifetime — $99.89"
                      : "Sign in to buy"}
                </Button>
              )
            }
            footnote="Lifetime access with founder benefits"
          />
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground/60">
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
      className={`relative rounded-xl border p-8 transition-all duration-standard ease-precision ${
        highlight
          ? "border-primary/50 bg-surface-mid shadow-elevated"
          : "border-border bg-surface-low"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 right-6 rounded-md bg-foreground px-3 py-1 text-[10px] font-bold tracking-widest text-background uppercase">
          {badge}
        </span>
      )}
      {accent && (
        <span className="absolute -top-3 left-6 rounded-md border border-border bg-surface-mid px-3 py-1 text-[10px] font-bold tracking-widest text-foreground uppercase">
          Recommended
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <h3 className="text-display !text-2xl">{name}</h3>
      </div>
      <div className="mt-8 flex items-baseline gap-2">
        <span className="text-display !text-5xl">{price}</span>
        <span className="eyebrow !text-[9px] !text-muted-foreground">{cadence}</span>
      </div>
      <ul className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground/80">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10">{cta}</div>
      {footnote && <p className="mt-4 text-center text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">{footnote}</p>}
    </div>
  );
}
