import { describe, expect, it } from "vitest";

import { computeFunnel, PRIMARY_FUNNEL } from "./funnel";

const t = (s: number) => new Date(1_700_000_000_000 + s * 1000).toISOString();

describe("computeFunnel", () => {
  it("returns empty result for empty steps", () => {
    const r = computeFunnel([], []);
    expect(r.steps).toEqual([]);
    expect(r.total_sessions).toBe(0);
  });

  it("counts a fully-converting session end-to-end", () => {
    const rows = [
      { session_id: "a", name: "page_view", ts: t(0) },
      { session_id: "a", name: "upload_completed", ts: t(1) },
      { session_id: "a", name: "enhance_started", ts: t(2) },
      { session_id: "a", name: "enhance_completed", ts: t(3) },
      { session_id: "a", name: "download_completed", ts: t(4) },
    ];
    const r = computeFunnel(rows, [...PRIMARY_FUNNEL]);
    expect(r.total_sessions).toBe(1);
    expect(r.completed_sessions).toBe(1);
    expect(r.overall_conversion).toBe(1);
    expect(r.steps.every((s) => s.sessions === 1)).toBe(true);
  });

  it("drops sessions that never reach step 0 from the base", () => {
    const rows = [
      { session_id: "a", name: "page_view", ts: t(0) },
      { session_id: "b", name: "feature_interaction", ts: t(0) }, // no page_view
    ];
    const r = computeFunnel(rows, ["page_view", "upload_completed"]);
    expect(r.total_sessions).toBe(1);
    expect(r.steps[0].sessions).toBe(1);
  });

  it("ignores out-of-order events (upload before page_view)", () => {
    const rows = [
      { session_id: "a", name: "upload_completed", ts: t(0) },
      { session_id: "a", name: "page_view", ts: t(5) },
    ];
    const r = computeFunnel(rows, ["page_view", "upload_completed"]);
    expect(r.steps[0].sessions).toBe(1);
    expect(r.steps[1].sessions).toBe(0);
    expect(r.overall_conversion).toBe(0);
  });

  it("computes step_conversion and drop_off per step", () => {
    const rows: { session_id: string; name: string; ts: string }[] = [];
    // 10 sessions view; 4 upload; 2 enhance_start
    for (let i = 0; i < 10; i++) rows.push({ session_id: `s${i}`, name: "page_view", ts: t(0) });
    for (let i = 0; i < 4; i++)
      rows.push({ session_id: `s${i}`, name: "upload_completed", ts: t(1) });
    for (let i = 0; i < 2; i++)
      rows.push({ session_id: `s${i}`, name: "enhance_started", ts: t(2) });
    const r = computeFunnel(rows, ["page_view", "upload_completed", "enhance_started"]);
    expect(r.steps[0].sessions).toBe(10);
    expect(r.steps[1].sessions).toBe(4);
    expect(r.steps[2].sessions).toBe(2);
    expect(r.steps[1].step_conversion).toBe(0.4);
    expect(r.steps[1].drop_off).toBe(0.6);
    expect(r.steps[2].step_conversion).toBe(0.5);
    expect(r.overall_conversion).toBe(0.2);
  });

  it("handles duplicate events by taking the earliest timestamp", () => {
    const rows = [
      { session_id: "a", name: "page_view", ts: t(10) },
      { session_id: "a", name: "page_view", ts: t(0) },
      { session_id: "a", name: "upload_completed", ts: t(5) },
    ];
    const r = computeFunnel(rows, ["page_view", "upload_completed"]);
    expect(r.steps[1].sessions).toBe(1); // 5 >= 0
  });

  it("skips rows with invalid timestamps", () => {
    const rows = [
      { session_id: "a", name: "page_view", ts: "not-a-date" },
      { session_id: "a", name: "upload_completed", ts: t(1) },
    ];
    const r = computeFunnel(rows, ["page_view", "upload_completed"]);
    expect(r.total_sessions).toBe(0);
  });
});
