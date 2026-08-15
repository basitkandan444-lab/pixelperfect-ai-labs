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
      <Link to="/" className="flex items-center gap-2 group p-2 -ml-2" aria-label={`${SITE.name} home`}>
        <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-foreground transition-transform duration-standard group-hover:rotate-[8deg] group-hover:scale-110">
          <Sparkles className="h-3.5 w-3.5 text-background" aria-hidden="true" />
        </span>
        <span className="text-display !text-lg">
          Pixel Perfect <span className="text-muted-foreground font-medium">Pro</span>
        </span>
      </Link>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 eyebrow !text-[9px] !text-muted-foreground transition-all duration-standard hover:text-foreground hover:bg-surface-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to app
      </Link>
    </header>
  );
}
