// Admin gate for /api/public/intelligence/* + /api/public/evolution/*.
// The /api/public/* prefix bypasses Lovable's site auth, so we do the auth
// here: verify Bearer token, then check has_role('admin') via RPC.
//
// Server-only. Never import from client code.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type AdminGateResult =
  { ok: true; userId: string } | { ok: false; status: 401 | 403; code: string; message: string };

function makeClient(bearer?: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const isNew = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNew && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function requireAdmin(request: Request): Promise<AdminGateResult> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, code: "unauthorized", message: "Missing bearer token." };
  }
  const token = auth.slice(7).trim();
  if (token.split(".").length !== 3) {
    return { ok: false, status: 401, code: "unauthorized", message: "Invalid token." };
  }
  const supabase = makeClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  const uid = data?.claims?.sub;
  if (error || !uid) {
    return { ok: false, status: 401, code: "unauthorized", message: "Invalid session." };
  }
  const roleCheck = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (roleCheck.error || roleCheck.data !== true) {
    return { ok: false, status: 403, code: "forbidden", message: "Admin role required." };
  }
  return { ok: true, userId: uid };
}
