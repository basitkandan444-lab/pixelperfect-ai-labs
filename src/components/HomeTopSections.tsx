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
    <section aria-labelledby="bento-heading" className="relative mx-auto mt-24 max-w-7xl px-6 pb-24">
      <h2 id="bento-heading" className="sr-only">
        Obsidian Precision Infrastructure
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-6 lg:gap-8">
        {/* Spotlight Card */}
        <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface-low p-6 sm:p-8 transition-all duration-standard ease-precision hover:border-primary/40 md:col-span-6 lg:col-span-4 lg:p-12 shadow-elevated order-1 reveal">
          {/* Background Grid */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.03] [mask-image:radial-gradient(circle_at_top_right,white,transparent)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] bg-[size:32px_32px]" />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <div>
              <span className="eyebrow">
                <Sparkles className="h-3 w-3" /> System Access
              </span>
            </div>

            <div className="mt-8">
              <h3 className="text-display">
                Obsidian
                <span className="block mt-2 text-primary">
                  Precision.
                </span>
              </h3>
              
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">$3.99</span>
                <span className="text-lg text-muted-foreground">/ month</span>
              </div>
            </div>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Professional-grade enhancement powered by on-device WebGPU. 
              Zero latency, absolute privacy, and total creative control.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PREMIUM_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-foreground/80">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-auto pt-12 flex flex-wrap items-center gap-4">
              <Link
                to="/pricing"
                className="group/btn relative inline-flex items-center justify-center overflow-hidden rounded-md bg-primary px-8 py-4 text-sm font-bold text-primary-foreground transition-all duration-standard hover:scale-[1.02] active:scale-[0.98] shadow-elevated"
              >
                <span className="relative z-10">Start Precision Enhancement</span>
                <div className="absolute inset-0 -z-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover/btn:translate-x-[100%]" />
              </Link>
              <a
                href="#workspace"
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface-mid px-8 py-4 text-sm font-semibold text-foreground transition-all hover:bg-surface-high hover:border-foreground/20"
              >
                Launch Workspace
              </a>
            </div>
          </div>
        </article>

        {/* Feature Cards Stack */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 md:col-span-6 lg:grid-cols-1 lg:col-span-2 order-2">
          {[
            {
              icon: Lock,
              title: "Privacy First",
              desc: "On-device processing ensures zero data transit.",
            },
            {
              icon: Cpu,
              title: "GPU Native",
              desc: "Harnesses raw hardware for instant neural scaling.",
            },
            {
              icon: ShieldCheck,
              title: "Clean Export",
              desc: "Watermark-free assets at full 8K resolution.",
            }
          ].map((item, i) => (
            <article 
              key={i} 
              className="group relative overflow-hidden rounded-lg border border-border bg-surface-low p-6 transition-all duration-standard hover:bg-surface-mid shadow-subtle reveal"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-mid text-primary border border-border">
                <item.icon className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-foreground">{item.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </article>
          ))}
        </div>

        {/* Stats Matrix */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface-low p-4 md:col-span-6 md:grid-cols-4 lg:p-8 order-3 reveal">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="relative flex flex-col items-center justify-center p-4 text-center">
              <div className="absolute inset-y-4 right-0 hidden w-px bg-border md:block last:hidden" />
              <Icon className="h-4 w-4 text-primary opacity-60" />
              <span className="mt-3 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">{value}</span>
              <span className="eyebrow mt-1 !text-[9px]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
