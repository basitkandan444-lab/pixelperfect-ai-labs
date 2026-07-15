import { describe, expect, it } from "vitest";

import { computeJourneys } from "./journey";

const t = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();

describe("computeJourneys — paths, entries, drop-offs, depth", () => {
  it("returns empty when no events", () => {
    const r = computeJourneys([]);
    expect(r.total_sessions).toBe(0);
    expect(r.top_paths).toEqual([]);
    expect(r.terminals).toEqual({ success: 0, error: 0, abandonment: 0 });
  });

  it("orders per session by ts and dedupes consecutive dupes", () => {
    const r = computeJourneys([
      { session_id: "a", path: "/", name: "page_view", ts: t(2) },
      { session_id: "a", path: "/", name: "page_view", ts: t(0) },
      { session_id: "a", path: "/about", name: "page_view", ts: t(3) },
    ]);
    expect(r.total_sessions).toBe(1);
    expect(r.top_paths[0].path).toBe("/ > /about");
    expect(r.top_entries[0].path).toBe("/");
    expect(r.top_drop_offs[0].path).toBe("/about");
  });

  it("aggregates identical paths across sessions", () => {
    const r = computeJourneys([
      { session_id: "a", path: "/", name: "page_view", ts: t(0) },
      { session_id: "a", path: "/x", name: "page_view", ts: t(1) },
      { session_id: "b", path: "/", name: "page_view", ts: t(0) },
      { session_id: "b", path: "/x", name: "page_view", ts: t(1) },
      { session_id: "c", path: "/", name: "page_view", ts: t(0) },
    ]);
    expect(r.total_sessions).toBe(3);
    expect(r.top_paths[0].path).toBe("/ > /x");
    expect(r.top_paths[0].sessions).toBe(2);
  });

  it("truncates paths at maxDepth", () => {
    const r = computeJourneys(
      Array.from({ length: 5 }, (_, i) => ({
        session_id: "a",
        path: `/p${i}`,
        name: "page_view",
        ts: t(i),
      })),
      { maxDepth: 2 },
    );
    expect(r.top_paths[0].path).toBe("/p0 > /p1");
  });
});

describe("computeJourneys — Wave B intelligence", () => {
  it("classifies terminal outcomes: success / error / abandonment", () => {
    const r = computeJourneys([
      // success session
      { session_id: "s1", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s1", name: "enhance_completed", ts: t(1) },
      { session_id: "s1", name: "download_completed", ts: t(2) },
      // error session
      { session_id: "s2", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s2", name: "error", ts: t(1), ok: false },
      // abandonment session
      { session_id: "s3", path: "/", name: "page_view", ts: t(0) },
    ]);
    expect(r.terminals).toEqual({ success: 1, error: 1, abandonment: 1 });
  });

  it("detects immediate loops (a > b > a)", () => {
    const r = computeJourneys([
      { session_id: "s1", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s1", path: "/upload", name: "page_view", ts: t(1) },
      { session_id: "s1", path: "/", name: "page_view", ts: t(2) },
      { session_id: "s2", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s2", path: "/upload", name: "page_view", ts: t(1) },
      { session_id: "s2", path: "/", name: "page_view", ts: t(2) },
    ]);
    expect(r.top_loops[0]).toEqual({ loop: "/ > /upload > /", sessions: 2 });
  });

  it("surfaces worst paths ranked by non-success terminals", () => {
    const rows = [
      { session_id: "s1", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s1", name: "error", ts: t(1), ok: false },
      { session_id: "s2", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s2", name: "error", ts: t(1), ok: false },
      { session_id: "s3", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s3", name: "enhance_completed", ts: t(1) },
    ];
    const r = computeJourneys(rows);
    expect(r.worst_paths.length).toBeGreaterThan(0);
    expect(r.worst_paths[0].terminal).toBe("error");
    expect(r.worst_paths[0].sessions).toBe(2);
  });

  it("aggregates feature interactions (co-occurrence pairs per session)", () => {
    const r = computeJourneys([
      { session_id: "s1", name: "feature_interaction", feature: "sharpen", ts: t(0) },
      { session_id: "s1", name: "feature_interaction", feature: "denoise", ts: t(1) },
      { session_id: "s2", name: "feature_interaction", feature: "sharpen", ts: t(0) },
      { session_id: "s2", name: "feature_interaction", feature: "denoise", ts: t(1) },
    ]);
    expect(r.feature_interactions[0]).toEqual({ pair: "denoise + sharpen", sessions: 2 });
  });

  it("includes product events as synthetic @-prefixed path steps", () => {
    const r = computeJourneys([
      { session_id: "s1", path: "/", name: "page_view", ts: t(0) },
      { session_id: "s1", name: "upload_completed", ts: t(1) },
      { session_id: "s1", name: "enhance_completed", ts: t(2) },
    ]);
    expect(r.top_paths[0].path).toBe("/ > @upload_completed > @enhance_completed");
    expect(r.avg_depth).toBe(3);
  });
});
