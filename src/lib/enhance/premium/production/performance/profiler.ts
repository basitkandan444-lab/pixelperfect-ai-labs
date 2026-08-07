// Per-stage performance profiler. Pure, no side effects on prod builds
// (consumers only invoke it from DEV-guarded code paths).

export interface StageSpan {
  id: string;
  ms: number;
  startedAt: number;
  bytesIn?: number;
  bytesOut?: number;
}

export class Profiler {
  private spans: StageSpan[] = [];
  private t0 = 0;

  start(): void {
    this.t0 = now();
  }
  record(id: string, ms: number, bytesIn?: number, bytesOut?: number): void {
    this.spans.push({ id, ms, startedAt: this.t0, bytesIn, bytesOut });
  }
  time<T>(id: string, fn: () => T, bytesIn?: number): T {
    const s = now();
    const r = fn();
    this.record(id, now() - s, bytesIn);
    return r;
  }
  async timeAsync<T>(id: string, fn: () => Promise<T>, bytesIn?: number): Promise<T> {
    const s = now();
    const r = await fn();
    this.record(id, now() - s, bytesIn);
    return r;
  }
  snapshot(): StageSpan[] {
    return this.spans.slice();
  }
  totalMs(): number {
    return this.spans.reduce((s, x) => s + x.ms, 0);
  }
}

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function deviceMemoryGB(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const m = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" ? m : undefined;
}
