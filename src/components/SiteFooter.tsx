import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { SITE } from "@/lib/site";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/cookies", label: "Cookie Policy" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative mt-20 border-t border-border/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link to="/" className="flex items-center gap-2" aria-label={`${SITE.name} home`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
            </span>
            <span className="font-display text-base font-bold tracking-tight">{SITE.name}</span>
          </Link>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
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

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {SITE.name}. Free AI image enhancer & photo upscaler. All
          rights reserved.
        </p>
      </div>
    </footer>
  );
}
