// Dev-only telemetry collector. Ring buffer, in-memory, no network.
//
// Guarded at the call sites by `import.meta.env.DEV`; the module itself is
// safe to import in tests. It NEVER records image bytes — only ids, sizes,
// timings, and derived metrics.

export interface TelemetryEvent {
  ts: number;
  runId: string;
  kind: "run" | "stage" | "verify" | "bench";
  data: Record<string, unknown>;
}

const BUFFER: TelemetryEvent[] = [];
const MAX = 500;

export function record(ev: Omit<TelemetryEvent, "ts">): void {
  BUFFER.push({ ...ev, ts: Date.now() });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
}

export function snapshot(): TelemetryEvent[] {
  return BUFFER.slice();
}
export function clear(): void {
  BUFFER.length = 0;
}

/** Enable a global window hook for devtools inspection. Dev-only. */
export function installDevHook(): void {
  if (typeof window === "undefined") return;
  if (!import.meta.env?.DEV) return;
  (
    window as unknown as {
      __PPP_TELEMETRY__?: { snapshot: () => TelemetryEvent[]; clear: () => void };
    }
  ).__PPP_TELEMETRY__ = { snapshot, clear };
}
