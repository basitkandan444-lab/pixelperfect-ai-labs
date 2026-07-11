import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BUNDLE_BUDGETS,
  deploymentStatus,
  formatBytes,
  formatDuration,
  percent,
  relativeTime,
  STATUS_META,
} from "@/lib/ops";

describe("ops · deploymentStatus", () => {
  it("stays operational during the low-traffic warm-up window", () => {
    // Below the sample floor, ratios are too noisy to page on.
    expect(deploymentStatus({ requests: 3, successRate: 0 })).toBe("operational");
  });

  it("reports outage for a low success rate over a real sample", () => {
    expect(deploymentStatus({ requests: 100, successRate: 0.5 })).toBe("outage");
  });

  it("reports degraded for a moderate success rate", () => {
    expect(deploymentStatus({ requests: 100, successRate: 0.95 })).toBe("degraded");
  });

  it("reports operational for a healthy success rate", () => {
    expect(deploymentStatus({ requests: 100, successRate: 0.999 })).toBe("operational");
  });

  it("has display metadata for every status", () => {
    for (const status of ["operational", "degraded", "outage"] as const) {
      expect(STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(["ok", "warn", "bad"]).toContain(STATUS_META[status].tone);
    }
  });
});

describe("ops · formatting", () => {
  it("formats bytes across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("formats durations across scales", () => {
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("renders relative time buckets", () => {
    const now = Date.parse("2024-01-01T00:00:00.000Z");
    expect(relativeTime(new Date(now - 30_000).toISOString(), now)).toBe("30s ago");
    expect(relativeTime(new Date(now - 120_000).toISOString(), now)).toBe("2m ago");
    expect(relativeTime(new Date(now - 3_600_000 * 3).toISOString(), now)).toBe("3h ago");
    expect(relativeTime(new Date(now - 86_400_000 * 2).toISOString(), now)).toBe("2d ago");
    expect(relativeTime("nonsense", now)).toBe("unknown");
  });

  it("formats percentages with adaptive precision", () => {
    expect(percent(1)).toBe("100.0%");
    expect(percent(0.9234)).toBe("92.34%");
    expect(percent(Number.NaN)).toBe("—");
  });
});

describe("ops · bundle budgets", () => {
  it("stays in sync with the CI enforcement script", () => {
    // The .mjs script inlines the same numbers (it can't import TS). This test
    // fails if the two ever drift, keeping the dashboard and the gate honest.
    const script = readFileSync("scripts/check-bundle-size.mjs", "utf8");
    expect(BUNDLE_BUDGETS.maxChunkBytes).toBe(600 * 1024);
    expect(BUNDLE_BUDGETS.maxTotalJsBytes).toBe(1_400 * 1024);
    expect(BUNDLE_BUDGETS.maxTotalCssBytes).toBe(150 * 1024);
    expect(script).toContain("maxChunkBytes: 600 * 1024");
    expect(script).toContain("maxTotalJsBytes: 1_400 * 1024");
    expect(script).toContain("maxTotalCssBytes: 150 * 1024");
  });
});
