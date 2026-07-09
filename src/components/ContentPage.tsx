import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";

import { SITE } from "@/lib/site";
import { SiteFooter } from "@/components/SiteFooter";

interface ContentPageProps {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}

export function ContentPage({ title, intro, updated, children }: ContentPageProps) {
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
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {updated && (
              <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
            )}
            {intro && <p className="mt-4 text-base text-muted-foreground">{intro}</p>}
            <div className="prose-content mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </article>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
