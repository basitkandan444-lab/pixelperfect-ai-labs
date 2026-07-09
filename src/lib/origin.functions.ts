import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the absolute origin (e.g. https://example.com) of the current
 * request during SSR. Used to build absolute canonical and og:url tags,
 * which Lighthouse requires (relative canonicals are flagged invalid).
 *
 * Falls back to an empty string for local/prerender hosts so we never bake
 * "localhost" into a canonical — callers then use relative URLs instead.
 */
export const getRequestOrigin = createServerFn({ method: "GET" }).handler(async () => {
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
