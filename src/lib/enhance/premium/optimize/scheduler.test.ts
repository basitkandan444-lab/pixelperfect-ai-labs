import { describe, it, expect, vi } from "vitest";
import type { PremiumPlan } from "../intelligence/plan";
import { runPlan } from "./scheduler";

const plan: PremiumPlan = {
  stages: ["whiteBalance", "clahe", "vibrance"],
  params: {},
  backend: "js",
  modelIds: [],
  weights: { whiteBalance: 0.2, clahe: 0.5, vibrance: 0.3 },
  reasons: [],
};

describe("runPlan", () => {
  it("runs stages in order and reports monotonic progress", async () => {
    const seen: number[] = [];
    const order: string[] = [];
    const buf = new Uint8ClampedArray(16);
    await runPlan(
      buf,
      2,
      2,
      plan,
      {
        whiteBalance: (b) => {
          order.push("wb");
          return b;
        },
        clahe: (b) => {
          order.push("cl");
          return b;
        },
        vibrance: (b) => {
          order.push("vb");
          return b;
        },
      },
      { onProgress: (v) => seen.push(v) },
    );
    expect(order).toEqual(["wb", "cl", "vb"]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.at(-1)).toBe(1);
  });

  it("skips stages without runners but still advances progress", async () => {
    const buf = new Uint8ClampedArray(16);
    const run = vi.fn((b) => b);
    const out = await runPlan(buf, 2, 2, plan, { clahe: run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(out).toBe(buf);
  });

  it("throws AbortError when signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      runPlan(new Uint8ClampedArray(4), 1, 1, plan, {}, { signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
