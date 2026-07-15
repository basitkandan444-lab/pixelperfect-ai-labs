import { describe, expect, it } from "vitest";

import {
  buildReport,
  detectAlerts,
  forecastTrends,
  riskScore,
  type SnapshotRow,
} from "./reliability";

function row(overrides: Partial<SnapshotRow>): SnapshotRow {
  return {
    ts: "2026-07-15T00:00:00.000Z",
    requests: 100,
    success_rate: 1,
    avg_ms: 50,
    p95_ms: 120,
    lcp_p75: 2000,
    cls_p75: 0.05,
    inp_p75: 150,
    errors: {},
    ...overrides,
  };
}

describe("detectAlerts", () => {
  it("returns nothing with fewer than two points", () => {
    expect(detectAlerts([row({})])).toEqual([]);
  });

  it("fires an error_spike when errors triple over baseline", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", errors: { ai_failed: 2 } }),
      row({ ts: "2026-07-15T00:05:00Z", errors: { ai_failed: 2 } }),
      row({ ts: "2026-07-15T00:10:00Z", errors: { ai_failed: 20 } }),
    ];
    const hits = detectAlerts(rows);
    expect(hits.find((a) => a.kind === "error_spike")).toBeTruthy();
  });

  it("fires success_rate_drop when success rate falls > 2pp", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", success_rate: 0.995 }),
      row({ ts: "2026-07-15T00:05:00Z", success_rate: 0.995 }),
      row({ ts: "2026-07-15T00:10:00Z", success_rate: 0.9, requests: 200 }),
    ];
    const hits = detectAlerts(rows);
    const alert = hits.find((a) => a.kind === "success_rate_drop");
    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe("warning");
  });

  it("fires critical success_rate_drop when success drops below 90%", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", success_rate: 0.99 }),
      row({ ts: "2026-07-15T00:05:00Z", success_rate: 0.99 }),
      row({ ts: "2026-07-15T00:10:00Z", success_rate: 0.7, requests: 200 }),
    ];
    const alert = detectAlerts(rows).find((a) => a.kind === "success_rate_drop");
    expect(alert?.severity).toBe("critical");
  });

  it("fires latency_regression when p95 rises > 50%", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", p95_ms: 100 }),
      row({ ts: "2026-07-15T00:05:00Z", p95_ms: 110 }),
      row({ ts: "2026-07-15T00:10:00Z", p95_ms: 300, requests: 200 }),
    ];
    const alert = detectAlerts(rows).find((a) => a.kind === "latency_regression");
    expect(alert).toBeTruthy();
  });

  it("detects a new error code appearing in the current window", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", errors: { known: 5 } }),
      row({ ts: "2026-07-15T00:05:00Z", errors: { known: 5 } }),
      row({ ts: "2026-07-15T00:10:00Z", errors: { known: 5, brand_new: 4 } }),
    ];
    const alert = detectAlerts(rows).find((a) => a.kind === "new_error_code");
    expect(alert).toBeTruthy();
    expect(alert?.id).toContain("brand_new");
  });

  it("ignores low-volume noise", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", requests: 5, errors: { x: 0 } }),
      row({ ts: "2026-07-15T00:05:00Z", requests: 5, errors: { x: 3 } }),
    ];
    expect(detectAlerts(rows).find((a) => a.kind === "error_spike")).toBeFalsy();
  });
});

describe("forecastTrends", () => {
  it("flags degrading success rate when the slope trends down", () => {
    const rows = [1, 0.99, 0.98, 0.97, 0.96, 0.95].map((sr, i) =>
      row({ ts: `2026-07-15T0${i}:00:00Z`, success_rate: sr }),
    );
    const trend = forecastTrends(rows).find((t) => t.metric === "success_rate");
    expect(trend?.direction).toBe("degrading");
    expect(trend?.slopePerHour).toBeLessThan(0);
  });

  it("returns steady when values are flat", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row({ ts: `2026-07-15T0${i}:00:00Z`, p95_ms: 200 }),
    );
    const trend = forecastTrends(rows).find((t) => t.metric === "p95_ms");
    expect(trend?.direction).toBe("steady");
  });

  it("returns empty forecasts without enough data", () => {
    expect(forecastTrends([row({})])).toEqual([]);
  });
});

describe("riskScore + buildReport", () => {
  it("clamps risk to [0,1] and reflects severity", () => {
    const critical = riskScore(
      [
        {
          id: "x",
          kind: "success_rate_drop",
          severity: "critical",
          title: "",
          detail: "",
          evidence: { baseline: 0, current: 0, change: 0, samples: { baseline: 0, current: 0 } },
          recommendation: "",
          at: "",
        },
      ],
      [],
    );
    expect(critical).toBeGreaterThan(0);
    expect(critical).toBeLessThanOrEqual(1);
    expect(riskScore([], [])).toBe(0);
  });

  it("buildReport returns latest, baseline, alerts, trends and risk", () => {
    const rows = [
      row({ ts: "2026-07-15T00:00:00Z", success_rate: 0.995 }),
      row({ ts: "2026-07-15T00:05:00Z", success_rate: 0.995 }),
      row({ ts: "2026-07-15T00:10:00Z", success_rate: 0.8, requests: 200 }),
    ];
    const report = buildReport(rows);
    expect(report.points).toBe(3);
    expect(report.latest?.ts).toBe("2026-07-15T00:10:00Z");
    expect(report.alerts.length).toBeGreaterThan(0);
    expect(report.risk).toBeGreaterThan(0);
  });
});
