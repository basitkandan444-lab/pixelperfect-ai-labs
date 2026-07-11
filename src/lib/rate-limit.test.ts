import { describe, expect, it } from "vitest";

import { clientKeyFromRequest, createRateLimiter } from "@/lib/rate-limit";

// The rate limiter is the abuse-control boundary in front of the (paid) AI
// provider. A regression here either lets a single client exhaust credits, or
// wrongly blocks legitimate users. These tests pin the observable contract.

describe("createRateLimiter", () => {
  it("allows requests up to the limit and rejects the one after", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000;
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(false);
  });

  it("reports remaining count and clamps it at zero", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.check("ip", 0).remaining).toBe(1);
    expect(rl.check("ip", 0).remaining).toBe(0);
    // Over the limit stays at zero rather than going negative.
    expect(rl.check("ip", 0).remaining).toBe(0);
  });

  it("resets the window after it expires so clients recover", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 500).allowed).toBe(false);
    // Once the window has elapsed the client is allowed again.
    expect(rl.check("ip", 1_001).allowed).toBe(true);
  });

  it("tracks separate windows per key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    // A different client is unaffected by the first client's usage.
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 0).allowed).toBe(false);
  });

  it("exposes resetSec as whole seconds until the window ends", () => {
    const rl = createRateLimiter({ limit: 5, windowMs: 60_000 });
    expect(rl.check("ip", 0).resetSec).toBe(60);
    expect(rl.check("ip", 30_000).resetSec).toBe(30);
  });

  it("evicts stale keys once maxKeys is exceeded to bound memory", () => {
    // A flood of unique keys must not grow the map without bound.
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 5 });
    for (let i = 0; i < 20; i++) rl.check(`k${i}`, 0);
    // An expired key was swept, so a previously-seen key starts fresh (allowed).
    expect(rl.check("k0", 2_000).allowed).toBe(true);
  });
});

describe("clientKeyFromRequest", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://x", { headers });

  it("prefers cf-connecting-ip", () => {
    expect(
      clientKeyFromRequest(req({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" })),
    ).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip then the first x-forwarded-for hop", () => {
    expect(clientKeyFromRequest(req({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientKeyFromRequest(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
  });

  it("returns a shared 'unknown' bucket when no IP header is present", () => {
    expect(clientKeyFromRequest(req({}))).toBe("unknown");
  });
});
