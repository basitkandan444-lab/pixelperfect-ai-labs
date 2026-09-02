import { createMiddleware } from "@tanstack/react-start";

type StoredAuthSession = {
  access_token?: unknown;
  currentSession?: { access_token?: unknown };
};

function readStoredAccessToken(): string | undefined {
  if (typeof window === "undefined") return undefined;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (!stored || typeof stored !== "object") continue;
      const session: StoredAuthSession = stored;
      const token = session.access_token ?? session.currentSession?.access_token;
      if (typeof token === "string" && token.length > 0) return token;
    } catch {
      // A corrupt optional session must not block public routes.
    }
  }

  return undefined;
}

/**
 * Adds the existing browser session token to server-function requests without
 * loading the full auth SDK into every anonymous page's startup graph.
 */
export const attachStoredAuthToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = readStoredAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);