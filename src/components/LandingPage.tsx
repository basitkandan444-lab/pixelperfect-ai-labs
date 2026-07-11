import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Sparkles, Wand2 } from "lucide-react";

import { SITE } from "@/lib/site";
import type { LandingContent } from "@/lib/landing";
import { SiteFooter } from "@/components/SiteFooter";

export function LandingPage({ data }: { data: LandingContent }) {
  return (
    <div className="min-h-screen bg-hero">
      <div className="relative mx-auto flex max-w-3xl flex-col px-5 pt-8 sm:px-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">{SITE.name}</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to app
          </Link>
        </header>

        <main className="mt-12 pb-8">
          <article className="rounded-3xl glass p-6 shadow-elegant sm:p-10">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {data.h1}
            </h1>
            <p className="mt-4 text-base text-muted-foreground">{data.intro}</p>

            <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
              {/* Quick Summary — AI-readable, plain-language overview */}
              <section
                aria-label="Quick summary"
                className="rounded-2xl border border-border/70 bg-primary/5 p-5"
              >
                <h2 className="font-display text-base font-semibold text-foreground">
                  Quick summary
                </h2>
                <dl className="mt-3 flex flex-col gap-2">
                  <div>
                    <dt className="font-medium text-foreground">What this page is about</dt>
                    <dd>{data.summary.about}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Who it helps</dt>
                    <dd>{data.summary.helps}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">How {SITE.name} solves it</dt>
                    <dd>{data.summary.solves}</dd>
                  </div>
                </dl>
              </section>

              <Section heading="The problem">
                {data.problem.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </Section>

              <Section heading={`How ${SITE.name} solves it`}>
                {data.solution.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </Section>

              <Section heading="How to use it">
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {data.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </Section>

              <Section heading="Practical use cases">
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {data.useCases.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </Section>

              <Section heading="Supported image formats">
                <p>
                  You can upload JPG and JPEG (best for photos), PNG (best for screenshots, graphics
                  and transparency) and WEBP (a modern web format), up to 15MB per image. The
                  enhanced result is returned as a high-resolution PNG you can download instantly.
                </p>
              </Section>

              <Section heading="Your privacy">
                <p>{data.privacy}</p>
              </Section>

              <Section heading="Frequently asked questions">
                <div className="mt-1 flex flex-col gap-4">
                  {data.faqs.map((f, i) => (
                    <div key={i}>
                      <h3 className="font-display text-sm font-semibold text-foreground">{f.q}</h3>
                      <p className="mt-1">{f.a}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Call to action */}
              <section aria-label="Get started" className="flex flex-col items-start gap-3">
                <Link
                  to="/"
                  hash="workspace"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-6 py-3 font-display text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Wand2 className="h-5 w-5" aria-hidden="true" />
                  {data.cta}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Free forever · No signup · No watermark
                </p>
              </section>

              {/* Internal linking — related tools */}
              <Section heading="Related tools">
                <ul className="mt-1 grid gap-3 sm:grid-cols-2">
                  {data.related.map((r) => (
                    <li key={r.path}>
                      <Link
                        to={r.path}
                        className="group flex h-full flex-col gap-1 rounded-2xl border border-border/70 p-4 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
                          {r.label}
                          <ArrowRight
                            className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="text-xs">{r.blurb}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-4">
                  Prefer to just get started?{" "}
                  <Link
                    to="/"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Open the free {SITE.name} enhancer
                  </Link>{" "}
                  or read the{" "}
                  <Link
                    to="/"
                    hash="faq-heading"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    full FAQ
                  </Link>
                  .
                </p>
              </Section>
            </div>
          </article>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
