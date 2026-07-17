import { describe, expect, it } from "vitest";

import { computeCohorts, DEFAULT_RETENTION_EVENTS } from "./cohorts";

const DAY = 86_400_000;
const t = (day: number, s = 0) => new Date(day * DAY + s * 1000).toISOString();

describe("computeCohorts — daily (default), meaningful retention", () => {
  it("returns empty for no events", () => {
    const r = computeCohorts([], 7);
    expect(r.cohorts).toEqual([]);
    expect(r.granularity).toBe("daily");
    expect(r.retention_events).toEqual([...DEFAULT_RETENTION_EVENTS]);
  });

  it("page_view alone does NOT count as retention", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0), name: "page_view" },
        { session_id: "a", ts: t(2), name: "page_view" },
      ],
      3,
    );
    expect(r.cohorts[0].size).toBe(1);
    expect(r.cohorts[0].retention).toEqual([0, 0, 0]);
  });

  it("counts enhance_completed as retention on day+2", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0), name: "page_view" },
        { session_id: "a", ts: t(0, 1), name: "enhance_completed" },
        { session_id: "a", ts: t(2), name: "enhance_completed" },
        { session_id: "b", ts: t(0), name: "upload_completed" },
      ],
      3,
    );
    const c = r.cohorts[0];
    expect(c.size).toBe(2);
    expect(c.retention[0]).toBe(1);
    expect(c.retention[2]).toBe(0.5);
  });

  it('allows "*" to count any event (legacy behavior)', () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0), name: "page_view" },
        { session_id: "a", ts: t(2), name: "page_view" },
      ],
      3,
      { retentionEvents: ["*"] },
    );
    expect(r.cohorts[0].retention[2]).toBe(1);
  });

  it("assigns each session to its earliest first-seen day across all events", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(5), name: "enhance_completed" },
        { session_id: "a", ts: t(2), name: "page_view" },
      ],
      10,
    );
    expect(r.cohorts.length).toBe(1);
    expect(r.cohorts[0].cohort).toBe(t(2).slice(0, 10));
  });

  it("ignores invalid timestamps", () => {
    const r = computeCohorts([{ session_id: "a", ts: "not-a-date", name: "enhance_completed" }], 3);
    expect(r.cohorts).toEqual([]);
  });
});

describe("computeCohorts — weekly & monthly granularity", () => {
  it("weekly buckets group day 0..6 together", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0), name: "enhance_completed" },
        { session_id: "b", ts: t(6), name: "enhance_completed" },
        { session_id: "c", ts: t(7), name: "enhance_completed" },
      ],
      3,
      { granularity: "weekly" },
    );
    // a & b in one week bucket, c in the next
    expect(r.granularity).toBe("weekly");
    const sizes = r.cohorts.map((c) => c.size).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("monthly buckets use calendar month", () => {
    const jan = Date.UTC(2026, 0, 15);
    const feb = Date.UTC(2026, 1, 3);
    const r = computeCohorts(
      [
        { session_id: "a", ts: new Date(jan).toISOString(), name: "enhance_completed" },
        { session_id: "b", ts: new Date(feb).toISOString(), name: "enhance_completed" },
      ],
      2,
      { granularity: "monthly" },
    );
    expect(r.cohorts.map((c) => c.cohort)).toEqual(["2026-01", "2026-02"]);
  });
});
