// MODULE 4 — HTTP integration & security validation.
//
// The unit tests in `enhance-image.core.test.ts` exercise validation, retry and
// orchestration with well-formed inputs. This suite attacks the endpoint at the
// HTTP boundary the way a hostile or buggy client would: malformed bodies, wrong
// content types, oversized payloads, malicious filenames, unexpected MIME types
// and SVG payloads. It asserts two things for every case:
//
//   1. The endpoint FAILS SAFELY — a typed error envelope with the right status,
//      never a 200, never an unhandled throw.
//   2. NOTHING SENSITIVE LEAKS — no API key, no stack trace, no upstream URL, no
//      internal model name in the response body.
//
// It drives `handleEnhanceImage(Request, deps)` directly (the exact function the
// route adapter calls) so the full request lifecycle — parsing, rate limiting,
// size guard, validation, error mapping and serialization — is covered without a
// live network or a running server.

import { describe, expect, it, vi } from "vitest";

import { handleEnhanceImage, MAX_BODY_BYTES, type EnhanceDeps } from "@/lib/enhance-image.core";
import { createRateLimiter } from "@/lib/rate-limit";

const API_KEY = "sk-secret-key-should-never-appear-in-a-response";
const VALID_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

// A fresh limiter per call keeps cases independent (no cross-test window bleed).
function deps(overrides: Partial<EnhanceDeps> = {}): EnhanceDeps {
  return {
    apiKey: API_KEY,
    rateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    // Default fetch throws — a well-formed request should never reach it in the
    // security cases below; if it does, the test fails loudly.
    fetchImpl: vi.fn(async () => {
      throw new Error("upstream must not be called for a rejected request");
    }),
    ...overrides,
  };
}

// Build a raw request with an arbitrary string/blob body (bypasses JSON.stringify
// so we can send genuinely malformed payloads).
function rawRequest(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/enhance-image", {
    method: "POST",
    headers: { "cf-connecting-ip": `10.0.${Math.random()}.1`, ...headers },
    body,
  });
}

async function readBody(res: Response): Promise<string> {
  return await res.clone().text();
}

// A single assertion reused everywhere: the serialized response must not disclose
// secrets or internal implementation details, regardless of the failure path.
async function assertNoSensitiveLeak(res: Response) {
  const text = await readBody(res);
  expect(text).not.toContain(API_KEY);
  expect(text.toLowerCase()).not.toContain("bearer ");
  expect(text).not.toContain("ai.gateway.lovable.dev");
  expect(text).not.toContain("gemini");
  // No raw stack traces surfaced to clients.
  expect(text).not.toMatch(/\bat\s+.+\(.+:\d+:\d+\)/);
}

describe("HTTP security — malformed & hostile requests fail safely", () => {
  it("rejects malformed JSON with 400 (not a 500 throw)", async () => {
    const res = await handleEnhanceImage(
      rawRequest("{ not valid json ", { "content-type": "application/json" }),
      deps(),
    );
    expect(res.status).toBe(400);
    const json = await res.clone().json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("invalid_request");
    await assertNoSensitiveLeak(res);
  });

  it("rejects an empty body with 400", async () => {
    const res = await handleEnhanceImage(
      rawRequest("", { "content-type": "application/json" }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects a wrong content type (form-encoded) with 400", async () => {
    const res = await handleEnhanceImage(
      rawRequest("image=whatever", { "content-type": "application/x-www-form-urlencoded" }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects a multipart body — the endpoint only accepts JSON", async () => {
    const form = new FormData();
    form.set("image", new Blob(["binary"], { type: "image/png" }), "photo.png");
    const res = await handleEnhanceImage(rawRequest(form), deps());
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects an oversized payload from Content-Length BEFORE buffering (413)", async () => {
    const res = await handleEnhanceImage(
      rawRequest("{}", {
        "content-type": "application/json",
        "content-length": String(MAX_BODY_BYTES + 1),
      }),
      deps(),
    );
    expect(res.status).toBe(413);
    const json = await res.clone().json();
    expect(json.error.code).toBe("payload_too_large");
    await assertNoSensitiveLeak(res);
  });

  it("rejects an SVG data URL (script-capable vector format is unsupported)", async () => {
    const svg =
      "data:image/svg+xml;base64," +
      Buffer.from('<svg onload="alert(1)"></svg>').toString("base64");
    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: svg }), { "content-type": "application/json" }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects an unexpected MIME type (image/gif) — allow-list is JPG/PNG/WEBP", async () => {
    const gif = "data:image/gif;base64," + Buffer.from("GIF89a").toString("base64");
    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: gif }), { "content-type": "application/json" }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects a data URL carrying a path-traversal / injection filename attempt", async () => {
    // The image field is a data URL, never a filename, so a traversal string is
    // simply not a valid data URL and is rejected — proving filenames can never
    // reach the filesystem through this endpoint.
    const malicious = "data:image/png;name=../../etc/passwd;base64,AAAA";
    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: malicious }), { "content-type": "application/json" }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });

  it("rejects an invalid scale enum with 400", async () => {
    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: VALID_IMAGE, scale: "16k" }), {
        "content-type": "application/json",
      }),
      deps(),
    );
    expect(res.status).toBe(400);
    await assertNoSensitiveLeak(res);
  });
});

describe("HTTP integration — full lifecycle over the real Request/Response boundary", () => {
  it("returns a standardized success envelope + no-store cache header", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { images: [{ image_url: { url: VALID_IMAGE } }] } }] }),
    ) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: VALID_IMAGE, scale: "8k" }), {
        "content-type": "application/json",
      }),
      deps({ fetchImpl }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.clone().json();
    expect(json.success).toBe(true);
    expect(json.data.image).toBe(VALID_IMAGE);
    expect(json.data.scale).toBe("8k");
    expect(json.requestId).toBeTruthy();
  });

  it("maps a missing API key to a safe 500 without leaking config", async () => {
    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: VALID_IMAGE }), { "content-type": "application/json" }),
      deps({ apiKey: undefined }),
    );
    expect(res.status).toBe(500);
    const json = await res.clone().json();
    expect(json.error.code).toBe("ai_unconfigured");
    await assertNoSensitiveLeak(res);
  });

  it("maps upstream malformed JSON to a safe 502 (no upstream detail leaked)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("<html>gateway 200 but not json</html>", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: VALID_IMAGE }), { "content-type": "application/json" }),
      deps({ fetchImpl }),
    );
    expect(res.status).toBe(502);
    const json = await res.clone().json();
    expect(json.error.code).toBe("ai_failed");
    await assertNoSensitiveLeak(res);
  });

  it("maps a well-formed upstream response with no image to a safe 502", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: {} }] }),
    ) as unknown as typeof fetch;

    const res = await handleEnhanceImage(
      rawRequest(JSON.stringify({ image: VALID_IMAGE }), { "content-type": "application/json" }),
      deps({ fetchImpl }),
    );
    expect(res.status).toBe(502);
    const json = await res.clone().json();
    expect(json.error.code).toBe("no_image");
    await assertNoSensitiveLeak(res);
  });

  it("enforces rate limiting at the HTTP layer with Retry-After + limit headers", async () => {
    const shared = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { images: [{ image_url: { url: VALID_IMAGE } }] } }] }),
    ) as unknown as typeof fetch;

    const make = () =>
      handleEnhanceImage(
        rawRequest(JSON.stringify({ image: VALID_IMAGE }), {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.7",
        }),
        deps({ rateLimiter: shared, fetchImpl }),
      );

    const first = await make();
    expect(first.status).toBe(200);
    const second = await make();
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    expect(second.headers.get("x-ratelimit-limit")).toBe("1");
    await assertNoSensitiveLeak(second);
  });
});
