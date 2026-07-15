import { describe, expect, it } from "vitest";

import { computeCohorts } from "./cohorts";

const DAY = 86_400_000;
const t = (day: number, s = 0) => new Date(day * DAY + s * 1000).toISOString();

describe("computeCohorts", () => {
  it("returns empty for no events", () => {
    expect(computeCohorts([], 7)).toEqual({ window_days: 7, cohorts: [] });
  });

  it("day 0 retention is 1 for every cohort", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0) },
        { session_id: "b", ts: t(1) },
      ],
      3,
    );
    expect(r.cohorts.length).toBe(2);
    for (const c of r.cohorts) expect(c.retention[0]).toBe(1);
  });

  it("counts a returning session on day+2", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(0) },
        { session_id: "a", ts: t(2) },
        { session_id: "b", ts: t(0) },
      ],
      3,
    );
    const c0 = r.cohorts.find((c) => c.retention.length === 3)!;
    expect(c0.size).toBe(2);
    expect(c0.retention[0]).toBe(1);
    expect(c0.retention[1]).toBe(0);
    expect(c0.retention[2]).toBe(0.5);
  });

  it("assigns each session to its earliest day", () => {
    const r = computeCohorts(
      [
        { session_id: "a", ts: t(5) },
        { session_id: "a", ts: t(2) },
        { session_id: "a", ts: t(9) },
      ],
      10,
    );
    expect(r.cohorts.length).toBe(1);
    expect(r.cohorts[0].cohort).toBe(t(2).slice(0, 10));
  });

  it("ignores invalid timestamps", () => {
    const r = computeCohorts([{ session_id: "a", ts: "not-a-date" }], 3);
    expect(r.cohorts).toEqual([]);
  });
});
