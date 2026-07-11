import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";

import { SITE } from "@/lib/site";

/**
 * Shared top-of-page header for secondary pages (content + landing).
 * Renders the brand mark linking home plus a "Back to app" action.
 * The home route uses its own richer navigation, so this is scoped to
 * subpages to avoid a false abstraction.
 */
export function PageHeader() {
  return (
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
  );
}
