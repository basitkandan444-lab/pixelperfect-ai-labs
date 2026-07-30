import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

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
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(["auth-session"], session);
      queryClient.invalidateQueries({ queryKey: ["entitlement"] });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return query;
}
