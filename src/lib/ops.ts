// Shared, framework-agnostic logic for the Developer Command Center.
//
// Pure functions only — no React, no server-only imports — so the same status
// thresholds power the /ops dashboard, the /api/public/health check, and unit
// tests. This is the single source of truth for "is this deployment healthy?".

export type ServiceStatus = "operational" | "degraded" | "outage";

/**
 * Derive an overall service status from the reliability metrics. Thresholds are
 * deliberately conservative — the same ones a pager would use.
 *
 *   - outage:   success rate < 80% over a non-trivial sample
 *   - degraded: success rate < 98% over a non-trivial sample
 *   - operational otherwise (including the zero-traffic warm-up window)
 */
export function deploymentStatus(input: { requests: number; successRate: number }): ServiceStatus {
  // Below this sample size, ratios are too noisy to page on.
  if (input.requests < 10) return "operational";
  if (input.successRate < 0.8) return "outage";
  if (input.successRate < 0.98) return "degraded";
  return "operational";
}

export const STATUS_META: Record<ServiceStatus, { label: string; tone: "ok" | "warn" | "bad" }> = {
  operational: { label: "Operational", tone: "ok" },
  degraded: { label: "Degraded", tone: "warn" },
  outage: { label: "Outage", tone: "bad" },
};

// ---- Bundle budgets (client JS shipped to users) --------------------------
//
// Enforced by scripts/check-bundle-size.mjs in CI. Budgets are gzip-equivalent
// (raw byte) ceilings on the emitted client assets. Set from the measured
// baseline with headroom; a real regression trips the gate, honest growth does
// not. Keeping the initial payload small is the single biggest lever on LCP.

export const BUNDLE_BUDGETS = {
  /**
   * Largest single client JS chunk. The dominant chunk is the TanStack Router
   * framework vendor bundle (~612 KB raw / ~139 KB gzip) — a single dependency
   * we cannot split further. The enhancement engine + its Web Worker are
   * code-split into their own lazy chunks (loaded on first Enhance click) so
   * they do NOT count against the initial payload. Ceiling set just above the
   * framework floor so a real regression still trips the gate.
   */
  maxChunkBytes: 640 * 1024,
  /** Total client JS shipped (sum of all .js assets). */
  maxTotalJsBytes: 1_400 * 1024,
  /** Total CSS shipped. */
  maxTotalCssBytes: 150 * 1024,
} as const;

// ---- Formatting helpers (dashboard display) --------------------------------

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Compact "time ago" from an ISO timestamp, for release/build display. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "unknown";
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function percent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(ratio >= 0.9995 ? 1 : 2)}%`;
}
