import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The analytics bridge is the ONLY place camelCase caller params (durationMs,
// size, engine, accel, path, out_w …) get normalised into the first-party
// event schema (duration_ms, bytes, ok, metrics). If this bridge silently
// drops fields, p50/p95 latency, engine-path segmentation, and failure rate
// all go dark — which is exactly the Problem #1 gap this module fixes.

type TrackCall = Parameters<typeof import("./track").track>[0];
const trackSpy = vi.fn<(input: TrackCall) => void>();

vi.mock("./track", () => ({
  track: (input: TrackCall) => trackSpy(input),
}));

// Ensure `typeof window !== "undefined"` so trackEvent runs its bridge branch
// under happy-dom / node.
beforeEach(() => {
  trackSpy.mockReset();
  // @ts-expect-error — vitest provides a window global under happy-dom
  if (typeof window === "undefined") globalThis.window = {} as unknown as Window;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trackEvent bridge", () => {
  it("promotes durationMs → duration_ms and size → bytes", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("enhance_complete", {
      scale: "4x",
      engine: "neural",
      accel: "webgpu",
      durationMs: 4321,
      size: 1234,
    });
    expect(trackSpy).toHaveBeenCalledTimes(1);
    const call = trackSpy.mock.calls[0][0];
    expect(call.name).toBe("enhance_completed");
    expect(call.duration_ms).toBe(4321);
    expect(call.bytes).toBe(1234);
    expect(call.ok).toBe(true);
    expect(call.metrics).toMatchObject({ scale: "4x", engine: "neural", accel: "webgpu" });
    // Reserved keys are NOT duplicated into metrics.
    expect(call.metrics && "durationMs" in call.metrics).toBe(false);
    expect(call.metrics && "size" in call.metrics).toBe(false);
  });

  it("maps enhance_fail to enhance_failed with ok=false and preserves error_code", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("enhance_fail", {
      scale: "2x",
      engine: "classical",
      error_code: "UnsupportedBrowserError",
      durationMs: 120,
      progress: 42,
    });
    const call = trackSpy.mock.calls[0][0];
    expect(call.name).toBe("enhance_failed");
    expect(call.ok).toBe(false);
    expect(call.error_code).toBe("UnsupportedBrowserError");
    expect(call.duration_ms).toBe(120);
    expect(call.metrics).toMatchObject({ scale: "2x", engine: "classical", progress: 42 });
  });

  it("preserves dimensional metrics (src_pixels, out_pixels, accel) on download", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("download", {
      scale: "4x",
      engine: "neural",
      path: "neural",
      out_w: 3840,
      out_h: 2160,
      out_pixels: 3840 * 2160,
    });
    const call = trackSpy.mock.calls[0][0];
    expect(call.name).toBe("download_completed");
    expect(call.ok).toBe(true);
    expect(call.metrics).toMatchObject({
      scale: "4x",
      engine: "neural",
      path: "neural",
      out_w: 3840,
      out_h: 2160,
      out_pixels: 3840 * 2160,
    });
  });

  it("routes an unmapped name to feature_interaction and keeps metrics", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("compare_slider_moved", { position: 0.42 });
    const call = trackSpy.mock.calls[0][0];
    expect(call.name).toBe("feature_interaction");
    expect(call.feature).toBe("compare_slider_moved");
    expect(call.metrics).toMatchObject({ position: 0.42 });
  });

  it("does not fabricate ok when the caller passed it explicitly", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("upload", { ok: false, error_code: "read_failed" });
    const call = trackSpy.mock.calls[0][0];
    expect(call.ok).toBe(false);
    expect(call.error_code).toBe("read_failed");
  });
});
