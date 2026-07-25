// Renders the "FINAL SCORE" object surfaced to devtools per run.

import type { TelemetryEvent } from "./collector";

export interface FinalScore {
  runId: string;
  totalMs: number;
  stages: { id: string; ms: number }[];
  skipped: string[];
  backend?: string;
  bundleImpactKB?: number;
  verification?: { score: number; status: string };
  bench?: Record<string, unknown>;
  compat?: string[];
  productionStatus: "pass" | "warn" | "fail";
}

export function buildFinalScore(runId: string, events: TelemetryEvent[]): FinalScore {
  const mine = events.filter((e) => e.runId === runId);
  const stages = mine
    .filter((e) => e.kind === "stage")
    .map((e) => ({ id: String(e.data.id), ms: Number(e.data.ms) || 0 }));
  const run = mine.find((e) => e.kind === "run");
  const verify = mine.find((e) => e.kind === "verify");
  return {
    runId,
    totalMs: stages.reduce((s, x) => s + x.ms, 0),
    stages,
    skipped: Array.isArray(run?.data.skipped) ? (run!.data.skipped as string[]) : [],
    backend: run?.data.backend as string | undefined,
    bundleImpactKB: run?.data.bundleImpactKB as number | undefined,
    verification: verify?.data as { score: number; status: string } | undefined,
    compat: Array.isArray(run?.data.compat) ? (run!.data.compat as string[]) : undefined,
    productionStatus:
      (verify?.data.status as "pass" | "warn" | "fail" | undefined) ??
      (stages.length ? "pass" : "warn"),
  };
}
