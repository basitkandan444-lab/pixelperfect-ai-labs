import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Bookmark, FlaskConical, Search } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: ReactNode };

const ITEMS: NavItem[] = [
  { to: "/admin", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/admin/investigations", label: "Investigations", icon: <Search className="h-4 w-4" /> },
  { to: "/admin/investigations", label: "Bookmarks", icon: <Bookmark className="h-4 w-4" /> },
  { to: "/ops", label: "Live Ops", icon: <Activity className="h-4 w-4" /> },
  { to: "/admin", label: "Sandbox", icon: <FlaskConical className="h-4 w-4" /> },
];

/**
 * Persistent Command Center navigation.
 *
 * Renders a horizontal tab strip on desktop and wraps on smaller screens.
 * Keeps the analyst one keystroke away from every operational area
 * (Overview, Investigations, Live Ops, Sandbox).
 */
export function CommandNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Command Center sections"
      className="border-b border-border bg-background/60 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-1.5">
        {ITEMS.map((item) => {
          const [path] = item.to.split("?");
          const active = pathname === path;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
