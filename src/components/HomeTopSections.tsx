import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Cpu, Sparkles, Zap, Lock, Infinity as InfinityIcon } from "lucide-react";

const PREMIUM_FEATURES = [
  "100 ultra quality images / month",
  "Balanced neural engine (Real-ESRGAN, on-device)",
  "Priority pipeline",
  "8K exports",
  "Cancel anytime",
];

/**
 * Three attention-grabbing sections rendered directly beneath the hero:
 * 1. Pricing spotlight  2. Why browser-first  3. Live capability stats
 */
export function HomeTopSections() {
  return (
    <>
      {/* 1 — Pricing spotlight */}
      <section
        aria-labelledby="pricing-spotlight-heading"
        className="relative mx-auto mt-6 max-w-5xl px-4"
      >
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[90px]"
          />
          <div className="relative grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Launch pricing
              </div>
              <h2
                id="pricing-spotlight-heading"
                className="mt-5 font-display text-4xl italic leading-[1.05] tracking-[-0.02em] sm:text-5xl"
              >
                100 ultra quality images
                <br />
                for <span className="text-shimmer">$0.99</span>
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Less than a coffee, every month. Every pixel processed on your own
                device — no uploads, no watermark, no queue.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/pricing"
                  className="sheen inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_40px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition-transform duration-300 hover:scale-[1.03]"
                >
                  Get Premium <span aria-hidden>→</span>
                </Link>
                <a
                  href="#workspace"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-medium text-foreground/85 transition hover:bg-white/10"
                >
                  Try 5 free
                </a>
              </div>
            </div>

            <ul className="space-y-3 rounded-3xl border border-white/10 bg-black/30 p-6 text-sm">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-foreground/90">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 2 — Why browser-first */}
      <section
        aria-labelledby="why-browser-first-heading"
        className="mx-auto mt-16 max-w-5xl px-4"
      >
        <h2
          id="why-browser-first-heading"
          className="text-center font-display text-3xl italic tracking-[-0.02em] sm:text-4xl"
        >
          Your photos never leave your device.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
              body: "Full-resolution exports, clean output, and no hidden processing fees.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:border-primary/30 hover:bg-white/[0.06]"
            >
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — Capability stats */}
      <section aria-labelledby="stats-heading" className="mx-auto mt-16 max-w-5xl px-4">
        <h2 id="stats-heading" className="sr-only">
          Engine capabilities
        </h2>
        <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur sm:grid-cols-4">
          {[
            { icon: Zap, value: "4×", label: "Upscale factor" },
            { icon: Sparkles, value: "8K", label: "Max export" },
            { icon: InfinityIcon, value: "0", label: "Bytes uploaded" },
            { icon: Cpu, value: "100", label: "Ultra images / mo" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden />
              <div className="mt-3 font-display text-4xl italic tracking-tight">{value}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
