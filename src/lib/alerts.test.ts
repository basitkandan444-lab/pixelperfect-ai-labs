import { describe, expect, it } from "vitest";

import {
  buildAlertLifecycles,
  detectionsFromAlerts,
  filterAlerts,
  relatedGroupOf,
  sortAlerts,
  type AlertAction,
  type AlertDetection,
} from "./alerts";

const D = (
  id: string,
  at: string,
  severity: "info" | "warning" | "critical" = "warning",
): AlertDetection => ({
  id,
  severity,
  title: id,
  detail: "detail",
  detectedAt: at,
});

const A = (
  alertId: string,
  type: AlertAction["type"],
  at: string,
  extra: Partial<AlertAction> = {},
): AlertAction => ({
  id: `${alertId}-${type}-${at}`,
  alertId,
  type,
  at,
  actor: "user-1",
  ...extra,
});

describe("alerts lifecycle", () => {
  it("builds a fresh active alert from a single detection", () => {
    const [lc] = buildAlertLifecycles({
      detections: [D("traffic-spike", "2026-01-01T00:00:00Z")],
      actions: [],
    });
    expect(lc.status).toBe("active");
    expect(lc.acknowledged).toBe(false);
    expect(lc.resolved).toBe(false);
    expect(lc.totalOccurrences).toBe(1);
    expect(lc.recurring).toBe(false);
    expect(lc.recurrenceCount).toBe(1);
    expect(lc.relatedGroup).toBe("traffic");
  });

  it("accumulates occurrences and severity history without overwriting prior state", () => {
    const [lc] = buildAlertLifecycles({
      detections: [
        D("automation-up", "2026-01-01T00:00:00Z", "warning"),
        D("automation-up", "2026-01-01T00:05:00Z", "critical"),
        D("automation-up", "2026-01-01T00:10:00Z", "critical"),
      ],
      actions: [],
    });
    expect(lc.totalOccurrences).toBe(3);
    expect(lc.severity).toBe("critical");
    expect(lc.severityHistory.map((s) => s.severity)).toEqual(["warning", "critical"]);
    expect(lc.durationMs).toBe(10 * 60_000);
  });

  it("acknowledges, resolves, and mutes an alert, preserving actor + timestamps", () => {
    const [lc] = buildAlertLifecycles({
      detections: [D("error-spike", "2026-01-01T00:00:00Z")],
      actions: [
        A("error-spike", "acknowledge", "2026-01-01T00:01:00Z", { note: "looking" }),
        A("error-spike", "note", "2026-01-01T00:02:00Z", { note: "still noisy" }),
        A("error-spike", "resolve", "2026-01-01T00:05:00Z", {
          actor: "user-2",
          note: "fixed rollout",
        }),
      ],
    });
    expect(lc.acknowledged).toBe(true);
    expect(lc.acknowledgedBy).toBe("user-1");
    expect(lc.acknowledgedAt).toBe("2026-01-01T00:01:00Z");
    expect(lc.resolved).toBe(true);
    expect(lc.resolvedBy).toBe("user-2");
    expect(lc.status).toBe("resolved");
    expect(lc.notes.map((n) => n.text)).toEqual(["looking", "still noisy", "fixed rollout"]);
  });

  it("re-opens a resolved alert on later detection and marks it recurring", () => {
    const [lc] = buildAlertLifecycles({
      detections: [
        D("error-spike", "2026-01-01T00:00:00Z"),
        D("error-spike", "2026-01-02T00:00:00Z"),
      ],
      actions: [A("error-spike", "resolve", "2026-01-01T00:30:00Z", { note: "fixed" })],
    });
    expect(lc.status).toBe("active");
    expect(lc.resolved).toBe(false);
    expect(lc.recurring).toBe(true);
    expect(lc.notes.some((n) => n.text.startsWith("Reopened"))).toBe(true);
  });

  it("counts distinct recurrence windows using the 6h gap", () => {
    const [lc] = buildAlertLifecycles({
      detections: [
        D("traffic-drop", "2026-01-01T00:00:00Z"),
        D("traffic-drop", "2026-01-01T01:00:00Z"), // same window
        D("traffic-drop", "2026-01-02T00:00:00Z"), // new window
        D("traffic-drop", "2026-01-05T00:00:00Z"), // new window
      ],
      actions: [],
    });
    expect(lc.recurrenceCount).toBe(3);
    expect(lc.recurring).toBe(true);
  });

  it("mutes then auto-expires the mute on unmute or when mutedUntil passes", () => {
    const now = Date.parse("2026-01-01T02:00:00Z");
    const [lcExpired] = buildAlertLifecycles({
      detections: [D("low-quality-majority", "2026-01-01T00:00:00Z")],
      actions: [
        A("low-quality-majority", "mute", "2026-01-01T00:10:00Z", {
          mutedUntil: "2026-01-01T01:00:00Z",
        }),
      ],
      now,
    });
    expect(lcExpired.muted).toBe(false);

    const [lcActiveMute] = buildAlertLifecycles({
      detections: [D("low-quality-majority", "2026-01-01T00:00:00Z")],
      actions: [
        A("low-quality-majority", "mute", "2026-01-01T00:10:00Z", {
          mutedUntil: "2026-01-01T05:00:00Z",
        }),
      ],
      now,
    });
    expect(lcActiveMute.muted).toBe(true);
    expect(lcActiveMute.status).toBe("muted");

    const [lcUnmuted] = buildAlertLifecycles({
      detections: [D("low-quality-majority", "2026-01-01T00:00:00Z")],
      actions: [
        A("low-quality-majority", "mute", "2026-01-01T00:10:00Z", {
          mutedUntil: "2026-01-01T05:00:00Z",
        }),
        A("low-quality-majority", "unmute", "2026-01-01T00:20:00Z"),
      ],
      now,
    });
    expect(lcUnmuted.muted).toBe(false);
    expect(lcUnmuted.status).toBe("active");
  });

  it("supports tag / untag / notes", () => {
    const [lc] = buildAlertLifecycles({
      detections: [D("traffic-spike", "2026-01-01T00:00:00Z")],
      actions: [
        A("traffic-spike", "tag", "2026-01-01T00:01:00Z", { tag: "vip" }),
        A("traffic-spike", "tag", "2026-01-01T00:02:00Z", { tag: "campaign" }),
        A("traffic-spike", "untag", "2026-01-01T00:03:00Z", { tag: "vip" }),
        A("traffic-spike", "note", "2026-01-01T00:04:00Z", { note: "monitor" }),
      ],
    });
    expect(lc.tags).toEqual(["campaign"]);
    expect(lc.notes).toHaveLength(1);
  });

  it("filters and sorts alert lists", () => {
    const list = buildAlertLifecycles({
      detections: [
        D("traffic-spike", "2026-01-01T00:00:00Z", "warning"),
        D("automation-up", "2026-01-01T01:00:00Z", "critical"),
        D("error-spike", "2026-01-01T02:00:00Z", "warning"),
      ],
      actions: [A("traffic-spike", "resolve", "2026-01-01T00:30:00Z")],
    });
    expect(filterAlerts(list, { status: "resolved" })).toHaveLength(1);
    expect(filterAlerts(list, { severity: "critical" })).toHaveLength(1);
    expect(filterAlerts(list, { search: "auto" }).map((a) => a.id)).toEqual(["automation-up"]);
    expect(filterAlerts(list, { group: "traffic" })).toHaveLength(1);
    const sorted = sortAlerts(list, "severity");
    expect(sorted[0].severity).toBe("critical");
  });

  it("maps alert ids to related groups", () => {
    expect(relatedGroupOf("traffic-spike")).toBe("traffic");
    expect(relatedGroupOf("automation-up")).toBe("quality");
    expect(relatedGroupOf("unknown-alert")).toBe("other");
  });

  it("converts raw Alert[] into stamped detections", () => {
    const dets = detectionsFromAlerts(
      [{ id: "x", severity: "info", title: "t", detail: "d" }],
      "2026-01-01T00:00:00Z",
    );
    expect(dets[0].detectedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("is idempotent — same inputs produce identical output", () => {
    const dets = [D("traffic-spike", "2026-01-01T00:00:00Z")];
    const acts = [A("traffic-spike", "acknowledge", "2026-01-01T00:01:00Z")];
    const a = buildAlertLifecycles({ detections: dets, actions: acts });
    const b = buildAlertLifecycles({ detections: dets, actions: acts });
    expect(a).toEqual(b);
  });
});
