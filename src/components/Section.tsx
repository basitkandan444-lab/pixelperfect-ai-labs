import type { ReactNode } from "react";

/**
 * A titled content section used across static/content and landing pages.
 * Single source of truth for section heading + spacing so the visual
 * rhythm stays consistent everywhere long-form content is rendered.
 */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
