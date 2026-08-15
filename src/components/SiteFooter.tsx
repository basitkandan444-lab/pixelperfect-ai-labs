import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { SITE } from "@/lib/site";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/cookies", label: "Cookie Policy" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative mt-20 border-t border-border bg-surface-low/50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link to="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground shadow-elevated">
              <Sparkles className="h-4 w-4 text-background" aria-hidden="true" />

            </span>
            <span className="text-display !text-base">Pixel Perfect <span className="text-muted-foreground font-medium">Pro</span></span>
          </Link>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="eyebrow !text-[9px]">
          © {new Date().getFullYear()} {SITE.name}. Free AI image enhancer & photo upscaler. All
          rights reserved.
        </p>
      </div>
    </footer>
  );
}
