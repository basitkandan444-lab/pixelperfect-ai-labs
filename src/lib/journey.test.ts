import { describe, expect, it } from "vitest";

import { computeJourneys } from "./journey";

const t = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();

describe("computeJourneys", () => {
  it("returns empty when no events", () => {
    const r = computeJourneys([]);
    expect(r.total_sessions).toBe(0);
    expect(r.top_paths).toEqual([]);
  });

  it("orders events per session by ts and dedupes consecutive dupes", () => {
    const r = computeJourneys([
      { session_id: "a", path: "/", ts: t(2) },
      { session_id: "a", path: "/", ts: t(0) },
      { session_id: "a", path: "/about", ts: t(3) },
    ]);
    expect(r.total_sessions).toBe(1);
    expect(r.top_paths[0].path).toBe("/ > /about");
    expect(r.top_entries[0].path).toBe("/");
    expect(r.top_drop_offs[0].path).toBe("/about");
  });

  it("aggregates identical paths across sessions", () => {
    const r = computeJourneys([
      { session_id: "a", path: "/", ts: t(0) },
      { session_id: "a", path: "/x", ts: t(1) },
      { session_id: "b", path: "/", ts: t(0) },
      { session_id: "b", path: "/x", ts: t(1) },
      { session_id: "c", path: "/", ts: t(0) },
    ]);
    expect(r.total_sessions).toBe(3);
    const top = r.top_paths[0];
    expect(top.path).toBe("/ > /x");
    expect(top.sessions).toBe(2);
    expect(top.fraction).toBeCloseTo(2 / 3, 3);
  });

  it("truncates paths at maxDepth", () => {
    const r = computeJourneys(
      Array.from({ length: 5 }, (_, i) => ({
        session_id: "a",
        path: `/p${i}`,
        ts: t(i),
      })),
      { maxDepth: 2 },
    );
    expect(r.top_paths[0].path).toBe("/p0 > /p1");
  });
});
