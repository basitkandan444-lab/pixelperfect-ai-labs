// Evolution engine types. Pure, server-safe, no runtime deps.

export type Category =
  "conversion" | "performance" | "capability" | "bundle" | "quality" | "memory";

export type Severity = "info" | "warn" | "critical";

export interface Evidence {
  metric: string;
  value: number;
  threshold: number;
  window: string;
  sample: number;
}

export interface Recommendation {
  id: string;
  category: Category;
  severity: Severity;
  subject: string;
  title: string;
  rationale: string;
  evidence: Evidence[];
  action: { kind: "plan-required"; note: string };
  createdAt: string;
}

// Deterministic input snapshot shared across every rule. Every field is
// optional so rules degrade gracefully when a data source is unavailable.
export interface EvolutionInputs {
  window: string; // e.g. "7d"
  now?: string;
  conversion?: {
    uploads: number;
    enhancements: number;
    downloads: number;
    wallHits: number;
    wallAbandons: number;
    checkoutStarted: number;
    checkoutCompleted: number;
  };
  capabilityUsage?: Array<{
    id: string;
    runs: number;
    upgradeAttributions: number;
    completionRate: number;
  }>;
  browserPerf?: Array<{
    browser: string;
    p95Ms: number;
    baselineP95Ms: number;
    sample: number;
  }>;
  qualityChecks?: Array<{ id: string; warnRate: number; sample: number }>;
  memoryPeaksMB?: Array<{ id: string; peakMB: number; budgetMB: number }>;
  bundle?: {
    freeChunkDeltaBytes: number;
    premiumChunkBytes: number;
    premiumChunkBudgetBytes: number;
  };
}

/** Stable, order-independent id for dedup. */
export function recId(category: Category, subject: string, window: string): string {
  return `${category}:${subject}:${window}`;
}
