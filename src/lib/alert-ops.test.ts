import { describe, expect, it } from "vitest";

import type {
  AlertAction,
  AlertDetection,
  AlertLifecycle,
} from "./alerts";
import {
  CORRELATION_WINDOW_MS,
  buildAlertTimeline,
  computeAlertOpsMetrics,
  correlateIncidents,
} from "./alert-ops";

const iso = (ms: number) => new Date(ms).toISOString();
const T0 = Date.parse("2026-07-14T10:00:00Z");

function lc(overrides: Partial<AlertLifecycle> & { id: string }): AlertLifecycle {
  return {
    id: overrides.id,
    type: overrides.id,
    severity: "warning",
    status: "active",
    title: overrides.id,
    detail: "",
    firstDetected: iso(T0),
    lastDetected: iso(T0),
    durationMs: 0,
    totalOccurrences: 1,
    severityHistory: [],
    acknowledged: false,
    resolved: false,
    muted: false,
    recurring: false,
    recurrenceCount: 1,
    relatedGroup: "traffic",
    notes: [],
    tags: [],
    ...overrides,
  };
}

describe("buildAlertTimeline", () => {
  it("merges detections and actions in order and emits severity_change + reopened", () => {
    const dets: AlertDetection[] = [
      { id: "traffic-spike", severity: "warning", title: "t", detail: "", detectedAt: iso(T0) },
      {
        id: "traffic-spike",
        severity: "critical",
        title: "t",
        detail: "worse",
        detectedAt: iso(T0 + 60_000),
      },
      // after resolve → reopened
      {
        id: "traffic-spike",
        severity: "warning",
        title: "t",
        detail: "",
        detectedAt: iso(T0 + 10 * 60_000),
      },
    ];
    const acts: AlertAction[] = [
      {
        id: "a1",
        alertId: "traffic-spike",
        type: "acknowledge",
        at: iso(T0 + 90_000),
        actor: "u1",
      },
      { id: "a2", alertId: "traffic-spike", type: "resolve", at: iso(T0 + 5 * 60_000), actor: "u1" },
    ];
    const tl = buildAlertTimeline("traffic-spike", dets, acts);
    const kinds = tl.map((t) => t.kind);
    expect(kinds).toEqual([
      "detected",
      "severity_change",
      "acknowledge",
      "resolve",
      "reopened",
      "severity_change",
    ]);
  });

  it("ignores actions and detections for other alert ids", () => {
    const tl = buildAlertTimeline(
      "a",
      [{ id: "b", severity: "info", title: "", detail: "", detectedAt: iso(T0) }],
      [{ id: "x", alertId: "b", type: "note", at: iso(T0), actor: "u", note: "hi" }],
    );
    expect(tl).toEqual([]);
  });
});

describe("computeAlertOpsMetrics", () => {
  it("computes MTTA/MTTR, noisy and recurring aggregates", () => {
    const list = [
      lc({
        id: "a",
        acknowledged: true,
        acknowledgedAt: iso(T0 + 60_000),
        resolved: true,
        resolvedAt: iso(T0 + 300_000),
        totalOccurrences: 5,
      }),
      lc({
        id: "b",
        severity: "critical",
        acknowledged: true,
        acknowledgedAt: iso(T0 + 120_000),
        resolved: true,
        resolvedAt: iso(T0 + 600_000),
        totalOccurrences: 40,
      }),
      lc({
        id: "c",
        recurring: true,
        recurrenceCount: 3,
        totalOccurrences: 25,
      }),
    ];
    const m = computeAlertOpsMetrics(list);
    expect(m.totalAlerts).toBe(3);
    expect(m.acknowledgedAlerts).toBe(2);
    expect(m.resolvedAlerts).toBe(2);
    expect(m.mttaMs).toBe(90_000);
    expect(m.mttrMs).toBe(450_000);
    expect(m.medianMttrMs).toBe(450_000);
    expect(m.p95MttrMs).toBe(600_000);
    expect(m.recurringCount).toBe(1);
    expect(m.topRecurring[0]?.id).toBe("c");
    expect(m.noisyAlerts.map((n) => n.id)).toEqual(["b", "c"]);
    expect(m.bySeverity.critical).toBe(1);
  });

  it("handles empty lists safely", () => {
    const m = computeAlertOpsMetrics([]);
    expect(m.totalAlerts).toBe(0);
    expect(m.mttaMs).toBeNull();
    expect(m.ackRate).toBe(0);
  });
});

describe("correlateIncidents", () => {
  it("groups related alerts inside the correlation window", () => {
    const list = [
      lc({
        id: "traffic-spike",
        relatedGroup: "traffic",
        firstDetected: iso(T0),
        lastDetected: iso(T0 + 60_000),
        severity: "warning",
      }),
      lc({
        id: "traffic-drop",
        relatedGroup: "traffic",
        firstDetected: iso(T0 + 5 * 60_000),
        lastDetected: iso(T0 + 6 * 60_000),
        severity: "critical",
      }),
    ];
    const inc = correlateIncidents(list);
    expect(inc).toHaveLength(1);
    expect(inc[0].alerts).toEqual(["traffic-spike", "traffic-drop"]);
    expect(inc[0].severity).toBe("critical");
    expect(inc[0].active).toBe(true);
    expect(inc[0].alertCount).toBe(2);
  });

  it("does not group across the correlation window", () => {
    const list = [
      lc({
        id: "traffic-spike",
        relatedGroup: "traffic",
        firstDetected: iso(T0),
        lastDetected: iso(T0),
      }),
      lc({
        id: "traffic-drop",
        relatedGroup: "traffic",
        firstDetected: iso(T0 + CORRELATION_WINDOW_MS + 60_000),
        lastDetected: iso(T0 + CORRELATION_WINDOW_MS + 60_000),
      }),
    ];
    expect(correlateIncidents(list)).toEqual([]);
  });

  it("ignores singletons and the 'other' bucket", () => {
    const list = [
      lc({ id: "solo", relatedGroup: "traffic" }),
      lc({ id: "x", relatedGroup: "other" }),
      lc({ id: "y", relatedGroup: "other" }),
    ];
    expect(correlateIncidents(list)).toEqual([]);
  });
});
