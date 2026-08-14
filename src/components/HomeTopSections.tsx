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
    <section aria-labelledby="bento-heading" className="relative mx-auto mt-12 max-w-6xl px-4 pb-24">
      <h2 id="bento-heading" className="sr-only">
        Precision Engineering Infrastructure
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-6 lg:gap-8">
        {/* Module 1: Pricing Architecture — World-Class Spotlight */}
        <article className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-8 transition-all duration-500 hover:border-primary/30 hover:bg-white/[0.04] md:col-span-4 lg:p-12 shadow-elegant">
          {/* Subtle Precision Background Pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(circle_at_top_right,white,transparent)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:24px_24px]" />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold tracking-wider text-primary uppercase">
                <Sparkles className="h-3 w-3" /> System Upgrade
              </span>
            </div>

            <div className="mt-8">
              <h3 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Precision for everyone.
                <span className="block mt-2 text-primary/90 opacity-90 transition-opacity group-hover:opacity-100">
                  Unlimited Potential.
                </span>
              </h3>
              
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">$3.99</span>
                <span className="text-lg text-muted-foreground">/ month</span>
              </div>
            </div>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground/90">
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
                className="group/btn relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary px-8 py-4 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-glow"
              >
                <span className="relative z-10">Start Precision Enhancement</span>
                <div className="absolute inset-0 -z-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover/btn:translate-x-[100%]" />
              </Link>
              <a
                href="#workspace"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-8 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:border-white/20"
              >
                Try Preview
              </a>
            </div>
          </div>
        </article>

        {/* Module 2: Core Capability Stack */}
        <div className="grid grid-cols-1 gap-6 md:col-span-2">
          {[
            {
              icon: Lock,
              title: "Privacy First",
              desc: "On-device processing ensures zero data transit.",
              color: "text-blue-400"
            },
            {
              icon: Cpu,
              title: "GPU Native",
              desc: "Harnesses raw hardware for instant neural scaling.",
              color: "text-purple-400"
            },
            {
              icon: ShieldCheck,
              title: "Clean Export",
              desc: "Watermark-free assets at full 8K resolution.",
              color: "text-emerald-400"
            }
          ].map((item, i) => (
            <article 
              key={i} 
              className="group relative overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-6 transition-all hover:bg-white/[0.05] shadow-elegant"
            >
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.03] ${item.color} border border-white/[0.05]`}>
                <item.icon className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-white">{item.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </article>
          ))}
        </div>

        {/* Module 3: Performance Matrix */}
        <div className="grid grid-cols-2 gap-4 rounded-[2rem] border border-white/[0.08] bg-white/[0.01] p-4 md:col-span-6 md:grid-cols-4 lg:p-8">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="relative flex flex-col items-center justify-center p-4 text-center">
              <div className="absolute inset-y-4 right-0 hidden w-px bg-white/[0.05] md:block last:hidden" />
              <Icon className="h-4 w-4 text-primary opacity-60" />
              <span className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">{value}</span>
              <span className="mt-1 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
