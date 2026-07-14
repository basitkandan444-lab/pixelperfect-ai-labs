import { describe, it, expect } from "vitest";

import {
  buildAlerts,
  buildExecutive,
  buildFullReport,
  buildIntelligence,
  buildRealtimeIntelligence,
  buildSourceIntelligence,
  buildTrends,
  buildVisitorTimelines,
  classifySession,
  groupSessions,
  type EventRow,
} from "./intelligence.server";

function ev(overrides: Partial<EventRow>): EventRow {
  return {
    session_id: "s1",
    name: "page_view",
    path: "/",
    source: "direct",
    medium: null,
    device_type: "desktop",
    os: "macOS",
    browser: "Chrome",
    ua_kind: "likely_human",
    country: "US",
    ts: new Date().toISOString(),
    duration_ms: null,
    ok: null,
    ...overrides,
  };
}

describe("intelligence · classifySession", () => {
  it("scores a genuine funnel-completing user as high-quality human", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ ts: new Date(base).toISOString(), name: "page_view", path: "/" }),
      ev({ ts: new Date(base + 4_200).toISOString(), name: "page_view", path: "/enhance" }),
      ev({ ts: new Date(base + 12_800).toISOString(), name: "upload_started" }),
      ev({ ts: new Date(base + 27_500).toISOString(), name: "enhance_started" }),
      ev({ ts: new Date(base + 46_100).toISOString(), name: "enhance_completed" }),
      ev({ ts: new Date(base + 51_900).toISOString(), name: "download_completed" }),
    ];
    const s = groupSessions(rows).get("s1")!;
    const c = classifySession(s);
    expect(c.qualityScore).toBeGreaterThan(75);
    expect(c.humanProbability).toBeGreaterThan(0.8);
    expect(c.segment).toBe("Activated");
    expect(c.confidence).not.toBe("low");
  });

  it("flags machine-fast, regular-cadence sessions as suspicious", () => {
    const base = Date.now();
    const rows: EventRow[] = Array.from({ length: 12 }, (_, i) =>
      ev({
        session_id: "bot",
        ts: new Date(base + i * 40).toISOString(),
        name: "page_view",
        path: "/",
        ua_kind: "suspicious",
      }),
    );
    const s = groupSessions(rows).get("bot")!;
    const c = classifySession(s);
    expect(c.humanProbability).toBeLessThan(0.2);
    expect(c.segment).toBe("Suspicious");
    expect(c.evidence.some((e) => e.signal === "Sub-human event cadence")).toBe(true);
  });
});

describe("intelligence · aggregate builders", () => {
  it("buildIntelligence returns coherent distribution + insights", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ ts: new Date(base).toISOString() }),
      ev({ ts: new Date(base + 5_000).toISOString(), name: "upload_started" }),
      ev({ ts: new Date(base + 12_000).toISOString(), name: "enhance_completed" }),
    ];
    const r = buildIntelligence(rows, 7);
    expect(r.overall.sessions).toBe(1);
    expect(r.overall.score).toBeGreaterThan(0);
    expect(r.retention.supported).toBe(false);
  });

  it("buildSourceIntelligence groups by source", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ session_id: "a", source: "organic", ts: new Date(base).toISOString() }),
      ev({ session_id: "b", source: "direct", ts: new Date(base).toISOString() }),
    ];
    const r = buildSourceIntelligence(rows);
    expect(r.length).toBe(2);
    expect(r.map((x) => x.source).sort()).toEqual(["direct", "organic"]);
  });

  it("buildVisitorTimelines returns per-session evidence", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ ts: new Date(base).toISOString() }),
      ev({ ts: new Date(base + 8_000).toISOString(), name: "upload_started" }),
    ];
    const t = buildVisitorTimelines(rows);
    expect(t.length).toBe(1);
    expect(t[0].timeline.length).toBe(2);
    expect(t[0].classification.evidence.length).toBeGreaterThan(0);
  });

  it("buildRealtimeIntelligence classifies the live window", () => {
    const now = Date.now();
    const rows: EventRow[] = [
      ev({ session_id: "a", ts: new Date(now - 10_000).toISOString(), name: "upload_started" }),
    ];
    const r = buildRealtimeIntelligence(rows, 300);
    expect(r.active).toBe(1);
    expect(r.currentlyUploading).toBe(1);
  });
});

describe("intelligence · advanced multi-signal detection", () => {
  it("consumes session_summary metrics: robotic click rhythm lowers human probability", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ ts: new Date(base).toISOString() }),
      ev({ ts: new Date(base + 1000).toISOString(), name: "page_view", path: "/a" }),
      {
        ...ev({ ts: new Date(base + 2000).toISOString(), name: "session_summary" }),
        metrics: {
          webdriver: true,
          mouseMoves: 0,
          hasTouch: false,
          sessionMs: 15000,
          clickCount: 6,
          clickIntervalCV: 0.02,
          readingMode: "scanning",
          languages: 0,
          hardwareConcurrency: 0,
        },
      },
    ];
    const s = groupSessions(rows).get("s1")!;
    const c = classifySession(s);
    expect(c.humanProbability).toBeLessThan(0.35);
    expect(c.evidence.some((e) => e.signal.includes("webdriver"))).toBe(true);
    expect(c.evidence.some((e) => e.signal.includes("Robotic click"))).toBe(true);
    expect(c.riskLevel).toBe("high");
    expect(c.summary?.readingMode).toBe("scanning");
  });

  it("buildExecutive returns headline, bullets and top source", () => {
    const base = Date.now();
    const rows: EventRow[] = [
      ev({ session_id: "a", source: "organic", ts: new Date(base).toISOString() }),
      ev({
        session_id: "a",
        source: "organic",
        name: "download_completed",
        ts: new Date(base + 10_000).toISOString(),
      }),
      ev({ session_id: "b", source: "direct", ts: new Date(base + 5_000).toISOString() }),
    ];
    const x = buildExecutive(rows, 7);
    expect(x.headline.length).toBeGreaterThan(0);
    expect(x.bullets.length).toBeGreaterThan(1);
    // Top source requires >=3 sessions per source; with light fixtures the
    // property is nullable — assert it doesn't throw and the shape is right.
    expect(x).toHaveProperty("topPerformingSource");
  });

  it("buildTrends buckets by day and computes direction/forecast", () => {
    const day1 = new Date();
    day1.setDate(day1.getDate() - 1);
    const day2 = new Date();
    const rows: EventRow[] = [
      ev({ session_id: "d1a", ts: day1.toISOString() }),
      ev({ session_id: "d2a", ts: day2.toISOString(), name: "enhance_completed" }),
    ];
    const t = buildTrends(rows, 7);
    expect(t.points.length).toBe(2);
    expect(t.movingAverage.length).toBe(2);
    expect(["up", "down", "flat"]).toContain(t.direction);
    expect(t.forecastQualityNextDay).not.toBeNull();
  });

  it("buildAlerts flags automation spike day-over-day", () => {
    const day1 = new Date();
    day1.setDate(day1.getDate() - 1);
    const day2 = new Date();
    const rows: EventRow[] = [
      ev({ session_id: "h1", ts: day1.toISOString(), name: "enhance_completed" }),
      ev({ session_id: "h2", ts: day1.toISOString(), name: "download_completed" }),
      // Day 2 is dominated by bot-flagged sessions
      ...Array.from({ length: 8 }, (_, i) =>
        ev({
          session_id: `bot${i}`,
          ua_kind: "suspicious",
          ts: new Date(day2.getTime() + i * 20).toISOString(),
        }),
      ),
    ];
    const alerts = buildAlerts(rows, 7);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => a.id === "automation-up" || a.id === "traffic-spike")).toBe(true);
  });

  it("buildFullReport produces markdown, csv and html", () => {
    const rows: EventRow[] = [ev({ ts: new Date().toISOString() })];
    const md = buildFullReport(rows, 7, "markdown");
    const csv = buildFullReport(rows, 7, "csv");
    const html = buildFullReport(rows, 7, "html");
    expect(md).toContain("# Pixel Perfect Pro");
    expect(csv.split("\n")[0]).toBe("section,key,value");
    expect(html).toContain("<!doctype html>");
  });
});
