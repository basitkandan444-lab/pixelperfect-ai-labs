import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Cpu, Sparkles, Zap, Lock, Gauge } from "lucide-react";

const PREMIUM_FEATURES = [
  "100 ultra quality images / month",
  "Balanced neural engine (Real-ESRGAN, on-device)",
  "Priority pipeline",
  "8K exports",
  "Cancel anytime",
];

const STATS = [
  { icon: Zap, value: "4×", label: "Upscale factor" },
  { icon: Sparkles, value: "8K", label: "Max export" },
  { icon: Lock, value: "0", label: "Bytes uploaded" },
  { icon: Gauge, value: "100", label: "Ultra images / mo" },
];

/**
 * Bento grid beneath the hero — Noir & Gold.
 * Mixed-size tiles: pricing spotlight (large), privacy + engine tiles,
 * and a full-width capability stats rail.
 */
export function HomeTopSections() {
  return (
    <section aria-labelledby="bento-heading" className="relative mx-auto mt-10 max-w-6xl px-4">
      <h2 id="bento-heading" className="sr-only">
        Why Pixel Perfect Pro
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {/* Pricing spotlight — hero tile */}
        <article className="lift relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-surface-low/60 p-8 backdrop-blur-2xl sm:p-10 md:col-span-4 shadow-elegant">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-[110px]"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Launch pricing
            </span>
            <h3 className="mt-6 font-display text-4xl leading-[1.05] sm:text-5xl">
              100 ultra quality images
              <br />
              for <span className="text-shimmer">$37.73 a year</span>
            </h3>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Just $3.14 a month, billed once — or pay $99.89 once and keep it for life. Every
              pixel processed on your own device: no uploads, no watermark, no queue.
            </p>

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/pricing"
                className="sheen inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_40px_-10px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-transform duration-300 hover:scale-[1.03]"
              >
                Get Premium <span aria-hidden>→</span>
              </Link>
              <a
                href="#workspace"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-medium text-foreground/85 transition hover:border-primary/40 hover:bg-white/10"
              >
                Try 5 free
              </a>
            </div>
          </div>
        </article>

        {/* Right column — stacked trust tiles */}
        <div className="grid gap-4 md:col-span-2">
          {[
            {
              icon: Lock,
              title: "Zero uploads",
              body: "Nothing is sent to a server. Enhancement happens entirely in your browser.",
            },
            {
              icon: Cpu,
              title: "WebGPU accelerated",
              body: "Real-ESRGAN runs on your GPU, with an automatic WASM fallback.",
            },
            {
              icon: ShieldCheck,
              title: "No watermarks",
              body: "Full-resolution exports, clean output, no hidden processing fees.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="lift rounded-[2rem] border border-white/5 bg-surface-low/40 p-6 backdrop-blur-xl shadow-elegant"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>

        {/* Full-width capability rail */}
        <article className="grid gap-6 rounded-[2.5rem] border border-white/5 bg-surface-low/30 p-8 backdrop-blur-xl sm:grid-cols-4 md:col-span-6 shadow-elegant">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
              <div className="mt-3 font-display text-4xl tracking-tight text-foreground">
                {value}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
