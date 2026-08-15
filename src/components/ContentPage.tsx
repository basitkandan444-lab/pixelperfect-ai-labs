import type { ReactNode } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { SiteFooter } from "@/components/SiteFooter";

// Re-export so content routes can keep importing { ContentPage, Section }
// from a single module.
export { Section };

interface ContentPageProps {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}

export function ContentPage({ title, intro, updated, children }: ContentPageProps) {
  return (
    <div className="min-h-dvh bg-hero">
      <div className="relative mx-auto flex max-w-3xl flex-col px-5 pt-8 sm:px-8">
        <PageHeader />

        <main className="mt-12 pb-8">
          <article className="rounded-xl border border-border bg-surface-low p-6 shadow-modal sm:p-10">
            <h1 className="text-display !text-3xl sm:!text-4xl">{title}</h1>
            {updated && (
              <p className="mt-2 eyebrow !text-[9px]">Last updated: {updated}</p>
            )}
            {intro && <p className="mt-4 text-base text-muted-foreground">{intro}</p>}
            <div className="prose-content mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </article>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
