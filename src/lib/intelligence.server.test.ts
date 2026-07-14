import { describe, it, expect } from "vitest";

import {
  buildIntelligence,
  buildRealtimeIntelligence,
  buildSourceIntelligence,
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
