import type { ReactNode } from "react";

/**
 * A titled content section used across static/content and landing pages.
 * Single source of truth for section heading + spacing so the visual
 * rhythm stays consistent everywhere long-form content is rendered.
 */
export function Section({ heading, children, delay = 0 }: { heading: string; children: ReactNode; delay?: number }) {
  return (
    <section 
      className="flex flex-col gap-3 reveal"
      style={{ transitionDelay: `${delay}ms` }}
      ref={(el) => {
        if (!el) return;
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("reveal-in");
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1 });
        observer.observe(el);
      }}
    >
      <h2 className="text-display !text-xl">{heading}</h2>
      {children}
    </section>
  );
}
