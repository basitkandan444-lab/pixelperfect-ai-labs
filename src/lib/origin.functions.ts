import { createIsomorphicFn } from "@tanstack/react-start";

/**
 * Returns the absolute origin (e.g. https://example.com) of the current
 * request. Used to build absolute canonical and og:url tags, which
 * Lighthouse requires (relative canonicals are flagged invalid).
 *
 * Isomorphic: on the server it reads the incoming request host (during
 * SSR / prerender); on the client it reads window.location.origin. This
 * avoids a wasteful server round-trip on every client-side navigation.
 *
 * Falls back to an empty string for local/prerender hosts so we never bake
 * "localhost" into a canonical — callers then use relative URLs instead.
 */
export const getRequestOrigin = createIsomorphicFn()
  .client(() => {
    const origin = window.location.origin;
    if (origin.startsWith("http://localhost") || origin.startsWith("http://127.")) return "";
    return origin;
  })
  .server(async () => {
    try {
      const { getRequestHost, getRequestProtocol } = await import("@tanstack/react-start/server");
      const host = getRequestHost();
      if (!host || host.startsWith("localhost") || host.startsWith("127.")) return "";
      const proto = getRequestProtocol() ?? "https";
      return `${proto}://${host}`;
    } catch {
      return "";
    }
  });

/**
 * Shared route loader that exposes the request origin to a route's `head()`
 * for building absolute canonical / og:url tags. Every page route shares the
 * exact same origin-loading requirement, so this is the single source of
 * truth instead of repeating the inline loader in each route file.
 */
export async function originLoader(): Promise<{ origin: string }> {
  return { origin: await getRequestOrigin() };
}
