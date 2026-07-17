import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log, newRequestId } from "./logger";

type Captured = { level: string; args: unknown[] }[];

function captureConsole() {
  const captured: Captured = [];
  const spy = {
    log: vi.spyOn(console, "log").mockImplementation((...a) => captured.push({ level: "info", args: a })),
    warn: vi.spyOn(console, "warn").mockImplementation((...a) => captured.push({ level: "warn", args: a })),
    error: vi.spyOn(console, "error").mockImplementation((...a) => captured.push({ level: "error", args: a })),
  };
  return {
    captured,
    restore() {
      spy.log.mockRestore();
      spy.warn.mockRestore();
      spy.error.mockRestore();
    },
  };
}

describe("logger", () => {
  let cap: ReturnType<typeof captureConsole>;
  beforeEach(() => {
    cap = captureConsole();
  });
  afterEach(() => cap.restore());

  it("emits a single JSON line per event with ts + level + event + fields", () => {
    log.info("enhance_started", { requestId: "abc", bytes: 1024, ok: true });
    expect(cap.captured).toHaveLength(1);
    const [line] = cap.captured[0].args as [string];
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("enhance_started");
    expect(parsed.requestId).toBe("abc");
    expect(parsed.bytes).toBe(1024);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.ts).toBe("string");
    // ISO-8601
    expect(Number.isFinite(Date.parse(parsed.ts))).toBe(true);
  });

  it("routes warn to console.warn and error to console.error", () => {
    log.warn("rate_limited", { requestId: "r1" });
    log.error("boom", { code: "AI_TIMEOUT" });
    expect(cap.captured.map((c) => c.level)).toEqual(["warn", "error"]);
    expect(JSON.parse(cap.captured[0].args[0] as string).level).toBe("warn");
    expect(JSON.parse(cap.captured[1].args[0] as string).code).toBe("AI_TIMEOUT");
  });

  it("preserves only scalar fields (no accidental object/array serialization surprises)", () => {
    log.info("evt", { a: 1, b: "s", c: true, d: null });
    const parsed = JSON.parse(cap.captured[0].args[0] as string);
    expect(parsed.a).toBe(1);
    expect(parsed.b).toBe("s");
    expect(parsed.c).toBe(true);
    expect(parsed.d).toBeNull();
  });

  it("newRequestId returns unique, non-empty strings", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(8);
    expect(b.length).toBeGreaterThan(8);
  });
});
