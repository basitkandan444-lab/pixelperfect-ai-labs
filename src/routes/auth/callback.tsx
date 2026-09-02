import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function safeNext(v: unknown): string {
  if (typeof v !== "string") return "/";
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "/",
    code: typeof s.code === "string" ? s.code : "",
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { next, code } = Route.useSearch();
  const target = safeNext(next);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        // PKCE flow: Supabase redirects back with a `code` + `state` in the
        // URL. The client auto-detects and exchanges them on init, so read the
        // session first. Fall back to an explicit exchange if detection did not
        // run (e.g. the code query param is still present after init).
        const { data: existing } = await supabase.auth.getSession();
        let session = existing.session;

        if (!session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        }

        if (!session) {
          throw new Error("No session was returned by Google.");
        }

        if (cancelled) return;
        window.location.replace(target);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Sign in failed");
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [code, target]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Sign in failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <a
            href="/auth"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Try again
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Completing sign in&hellip;</p>
    </main>
  );
}
