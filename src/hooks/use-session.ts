import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";

/**
 * The Supabase SDK is a large slice of the client payload and is not needed to
 * paint or use the browser-first enhancement flow, so it is loaded lazily after
 * hydration instead of being pulled into the initial entry chunk.
 */
const loadSupabase = () => import("@/integrations/supabase/client").then((m) => m.supabase);

function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("sb-") && key.endsWith("-auth-token")) return true;
  }
  return false;
}

/**
 * Shared auth-session query.
 *
 * - Never runs during SSR/prerender (`supabase.auth` needs browser storage).
 * - Does not retry: a missing/invalid session is a normal state, not an error.
 * - Subscribes to `onAuthStateChange` so signing in/out immediately refreshes
 *   the session AND any entitlement query derived from it. Without this the
 *   UI kept showing the signed-out state until a manual reload.
 */
export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery<Session | null>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      // Signed-out visitors do not need the auth SDK on the homepage. Avoiding
      // that download removes a large parse/evaluation task from mobile startup.
      if (!hasStoredSession()) return null;
      try {
        const supabase = await loadSupabase();
        return (await supabase.auth.getSession()).data.session;
      } catch (error) {
        // Auth is optional for the browser-first enhancement flow. A missing or
        // misconfigured backend must degrade to "signed out", never crash the page.
        console.warn("[auth] session unavailable:", error);
        return null;
      }
    },
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!hasStoredSession()) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // Same rule as above: never let auth wiring take down the render tree.
    loadSupabase()
      .then((supabase) => {
        if (cancelled) return;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          queryClient.setQueryData(["auth-session"], session);
          queryClient.invalidateQueries({ queryKey: ["entitlement"] });
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((error) => {
        console.warn("[auth] auth state listener unavailable:", error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient]);

  return query;
}
