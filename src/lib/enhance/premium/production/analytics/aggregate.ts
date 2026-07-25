// Dev-only cross-run aggregation over the telemetry ring buffer.

import type { TelemetryEvent } from "../telemetry/collector";

export interface StageAggregate {
  id: string;
  runs: number;
  avgMs: number;
  p95Ms: number;
}

export function aggregateStages(events: TelemetryEvent[]): StageAggregate[] {
  const byId = new Map<string, number[]>();
  for (const e of events) {
    if (e.kind !== "stage") continue;
    const id = String(e.data.id);
    const ms = Number(e.data.ms) || 0;
    const arr = byId.get(id) ?? [];
    arr.push(ms);
    byId.set(id, arr);
  }
  return Array.from(byId.entries()).map(([id, arr]) => {
    arr.sort((a, b) => a - b);
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
    return { id, runs: arr.length, avgMs: avg, p95Ms: p95 };
  });
}
