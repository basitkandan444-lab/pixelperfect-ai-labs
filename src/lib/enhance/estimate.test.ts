import { describe, it, expect } from "vitest";

import { estimateEnhanceMs, formatEta, formatRemaining } from "./estimate";

describe("estimateEnhanceMs", () => {
  it("returns a sane floor for invalid dimensions", () => {
    expect(estimateEnhanceMs({ srcW: 0, srcH: 0, scale: "4k", engine: "neural" })).toBe(1000);
    expect(estimateEnhanceMs({ srcW: NaN, srcH: 100, scale: "4k", engine: "classical" })).toBe(
      1000,
    );
  });

  it("never estimates below one second", () => {
    const ms = estimateEnhanceMs({ srcW: 32, srcH: 32, scale: "4k", engine: "classical" });
    expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it("neural takes longer than classical for the same image", () => {
    const base = { srcW: 800, srcH: 600, scale: "4k" as const, tier: "medium" as const };
    const classical = estimateEnhanceMs({ ...base, engine: "classical" });
    const neural = estimateEnhanceMs({ ...base, engine: "neural", warm: true });
    expect(neural).toBeGreaterThan(classical);
  });

  it("cold start adds time versus a warmed session", () => {
    const base = { srcW: 800, srcH: 600, scale: "4k" as const, engine: "neural" as const };
    const cold = estimateEnhanceMs({ ...base, warm: false });
    const warm = estimateEnhanceMs({ ...base, warm: true });
    expect(cold).toBeGreaterThan(warm);
  });

  it("faster device tiers estimate shorter times", () => {
    const base = {
      srcW: 1600,
      srcH: 1200,
      scale: "4k" as const,
      engine: "neural" as const,
      warm: true,
    };
    const high = estimateEnhanceMs({ ...base, tier: "high" });
    const medium = estimateEnhanceMs({ ...base, tier: "medium" });
    const low = estimateEnhanceMs({ ...base, tier: "low" });
    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
  });

  it("larger images estimate longer times", () => {
    const small = estimateEnhanceMs({
      srcW: 400,
      srcH: 300,
      scale: "4k",
      engine: "neural",
      warm: true,
      tier: "medium",
    });
    const large = estimateEnhanceMs({
      srcW: 1600,
      srcH: 1200,
      scale: "4k",
      engine: "neural",
      warm: true,
      tier: "medium",
    });
    expect(large).toBeGreaterThan(small);
  });
});

describe("formatEta", () => {
  it("formats seconds under a minute", () => {
    expect(formatEta(20_000)).toBe("about 20s");
    expect(formatEta(1_200)).toBe("about 2s");
  });

  it("formats minutes and seconds", () => {
    expect(formatEta(65_000)).toBe("about 1m 05s");
    expect(formatEta(125_000)).toBe("about 2m 05s");
  });
});

describe("formatRemaining", () => {
  it("counts down in seconds", () => {
    expect(formatRemaining(19_000)).toBe("19s remaining");
  });

  it("shows an almost-done message once the estimate is exhausted", () => {
    expect(formatRemaining(0)).toBe("Almost done…");
    expect(formatRemaining(-500)).toBe("Almost done…");
  });

  it("formats minutes and seconds remaining", () => {
    expect(formatRemaining(65_000)).toBe("1m 05s remaining");
  });
});
