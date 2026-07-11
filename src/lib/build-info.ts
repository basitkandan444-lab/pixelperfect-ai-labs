// Release intelligence: immutable metadata about the running build.
//
// Values are baked in at build time via Vite `define` (vite.config.ts) so the
// exact version, commit and build timestamp of any deployment are always
// recoverable at runtime — the foundation for release tracking, "which build am
// I looking at?", and correlating incidents with a specific rollout.
//
// Client- AND server-safe: no `process.env`, no `window`. The `typeof` guards
// keep it working in test runners where the define is not applied.

export type BuildInfo = {
  /** Semantic version from package.json at build time. */
  version: string;
  /** Short commit SHA (12 chars) when built in CI, else "local". */
  commit: string;
  /** ISO timestamp of when the bundle was built. */
  buildTime: string;
  /** Vite mode: "production" | "development" | test runner value. */
  mode: string;
};

export const BUILD_INFO: BuildInfo = {
  version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev",
  commit: typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "local",
  buildTime:
    typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : new Date(0).toISOString(),
  mode: (import.meta.env?.MODE as string | undefined) ?? "unknown",
};

/** A single, human-readable release identifier, e.g. `1.2.0+ab12cd34ef56`. */
export function releaseTag(info: BuildInfo = BUILD_INFO): string {
  return info.commit && info.commit !== "local"
    ? `${info.version}+${info.commit}`
    : `${info.version}-${info.mode}`;
}

/** Age of the build in whole seconds (never negative). */
export function buildAgeSeconds(now: number = Date.now(), info: BuildInfo = BUILD_INFO): number {
  const built = Date.parse(info.buildTime);
  if (!Number.isFinite(built)) return 0;
  return Math.max(0, Math.floor((now - built) / 1000));
}
