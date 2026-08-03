import { Link } from "@tanstack/react-router";
import { Sparkles, X, Check } from "lucide-react";
import { useEffect } from "react";

interface UpgradeWallProps {
  open: boolean;
  onClose: () => void;
  used: number;
  cap: number;
  isSignedIn: boolean;
  onUpgrade: () => void;
  pending?: boolean;
  /** False when the deployment's Stripe env is not configured — disables the
   * paid CTA instead of letting the user hit a confusing mid-checkout error. */
  billingAvailable?: boolean;
}

/**
 * Premium upgrade wall shown when a free user attempts enhancement #6.
 * IMPORTANT: this modal never clears the uploaded image — the user can
 * close it and their image is still on the workspace.
 */
export function UpgradeWall({
  open,
  onClose,
  used,
  cap,
  isSignedIn,
  onUpgrade,
  pending,
  billingAvailable = true,
}: UpgradeWallProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-wall-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <button
        aria-label="Close upgrade dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-[oklch(0.09_0_0/0.92)] p-8 text-white shadow-[0_30px_120px_-30px_rgba(10,132,255,0.55)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Free limit reached
        </div>

        <h2 id="upgrade-wall-title" className="mt-4 font-display text-3xl leading-tight md:text-4xl">
          You&rsquo;ve used all {cap} free enhancements.
        </h2>
        <p className="mt-3 text-sm text-white/65">
          Your image is safe — nothing was lost. Upgrade to Premium for 100 ultra quality images
          every month at just <span className="font-semibold text-white">$4.99 a year</span> — or
          pay <span className="font-semibold text-white">$19.68 once</span> for lifetime access.
        </p>

        <ul className="mt-6 space-y-2.5 text-sm text-white/85">
          {[
            "100 ultra quality images / month",
            "Priority processing pipeline",
            "8K exports",
            "Cancel anytime",
          ].map((f) => (
            <li key={f} className="flex items-start gap-3">
              <Check className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {!billingAvailable && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-100"
          >
            Premium checkout is temporarily unavailable. Your image and free usage are unaffected —
            please try upgrading again shortly.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onUpgrade}
            disabled={pending || !billingAvailable}
            className="flex-1 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-[0_0_40px_-8px_rgba(10,132,255,0.6)] transition hover:bg-white/90 disabled:opacity-60"
          >
            {!billingAvailable
              ? "Checkout unavailable"
              : pending
                ? "Opening checkout…"
                : isSignedIn
                  ? "Upgrade — $4.99 / year"
                  : "Sign in to upgrade"}
          </button>
          <Link
            to="/pricing"
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-center text-sm font-medium text-white/85 transition hover:bg-white/10"
          >
            View pricing
          </Link>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/40">
          {used} / {cap} free enhancements used · Secure checkout via Stripe
        </p>
      </div>
    </div>
  );
}
