import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

function safeNext(v: unknown): string {
  if (typeof v !== "string") return "/";
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

// The redirect target must be a route we own. Supabase appends the PKCE
// `code`/`state` params to this URL, then redirects the browser back here
// after Google approves the login.
function buildRedirectUrl(target: string): string {
  const url = new URL(window.location.origin);
  url.pathname = "/auth/callback";
  url.searchParams.set("next", target);
  return url.toString();
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Pixel Perfect Pro" },
      {
        name: "description",
        content: "Sign in securely to manage Pixel Perfect Pro premium access and analytics.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sign in | Pixel Perfect Pro" },
      {
        property: "og:description",
        content: "Sign in securely to manage Pixel Perfect Pro premium access and analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  beforeLoad: async ({ search, location }) => {
    // /auth/callback owns its own session handling; do not redirect it.
    if (location.pathname === "/auth/callback") return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: safeNext(search.next) });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const isCallback = useMatches().some((m) => m.routeId === "/auth/callback");
  // Nested callback route renders here; the sign-in page does not.
  if (isCallback) return <Outlet />;
  return <AuthPage />;
}

function AuthPage() {
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildRedirectUrl(target),
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your Google account to access the analytics dashboard.
        </p>

        <button
          onClick={google}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Continuing..." : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}
