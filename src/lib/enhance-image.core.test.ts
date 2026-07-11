import { describe, expect, it, vi } from "vitest";

import {
  BodySchema,
  extractImageUrl,
  fetchWithTimeout,
  handleEnhanceImage,
  MAX_BASE64_BYTES,
  MAX_BODY_BYTES,
  TimeoutError,
} from "@/lib/enhance-image.core";
import { createRateLimiter } from "@/lib/rate-limit";

const VALID_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/enhance-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
}

function gatewayResponse(url: string, status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { images: [{ image_url: { url } }] } }] }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("validation", () => {
  it("accepts a valid PNG data URL with default scale", () => {
    const parsed = BodySchema.parse({ image: VALID_IMAGE });
    expect(parsed.scale).toBe("4k");
  });

  it("rejects a non-data-URL string", () => {
    expect(() => BodySchema.parse({ image: "not-an-image" })).toThrow();
  });

  it("rejects an unsupported format", () => {
    expect(() => BodySchema.parse({ image: "data:image/gif;base64,AAAA" })).toThrow();
  });

  it("rejects an oversized payload", () => {
    const huge = `data:image/png;base64,${"A".repeat(MAX_BASE64_BYTES + 10)}`;
    expect(() => BodySchema.parse({ image: huge })).toThrow();
  });
});

describe("extractImageUrl", () => {
  it("reads the chat images shape", () => {
    expect(
      extractImageUrl({ choices: [{ message: { images: [{ image_url: { url: "x" } }] } }] }),
    ).toBe("x");
  });

  it("reads the data[].b64_json shape", () => {
    expect(extractImageUrl({ data: [{ b64_json: "abc" }] })).toBe("data:image/png;base64,abc");
  });

  it("returns undefined when no image present", () => {
    expect(extractImageUrl({ choices: [] })).toBeUndefined();
  });
});

describe("fetchWithTimeout", () => {
  it("throws TimeoutError when the request exceeds the deadline", async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    await expect(fetchWithTimeout("http://x", {}, 10, slow)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("handleEnhanceImage", () => {
  const okFetch = vi.fn(async () => gatewayResponse("https://cdn/enhanced.png"));

  it("returns 500 when API key is missing", async () => {
    const res = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), {
      apiKey: undefined,
    });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ai_unconfigured");
  });

  it("returns standardized success for a valid request", async () => {
    const res = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE, scale: "8k" }), {
      apiKey: "key",
      fetchImpl: okFetch as unknown as typeof fetch,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.image).toBe("https://cdn/enhanced.png");
    expect(body.requestId).toBeTruthy();
  });

  it("rejects an invalid request before calling the AI", async () => {
    const spy = vi.fn(async () => gatewayResponse("nope"));
    const res = await handleEnhanceImage(makeRequest({ image: "bad" }), {
      apiKey: "key",
      fetchImpl: spy as unknown as typeof fetch,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload with 400", async () => {
    const huge = `data:image/png;base64,${"A".repeat(MAX_BASE64_BYTES + 10)}`;
    const res = await handleEnhanceImage(makeRequest({ image: huge }), {
      apiKey: "key",
      fetchImpl: okFetch as unknown as typeof fetch,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    expect(res.status).toBe(400);
  });

  it("maps a timeout to 504", async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const res = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), {
      apiKey: "key",
      fetchImpl: slow,
      timeoutMs: 10,
      maxRetries: 0,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    const body = await res.json();
    expect(res.status).toBe(504);
    expect(body.error.code).toBe("ai_timeout");
  });

  it("retries a transient 5xx then succeeds", async () => {
    let calls = 0;
    const flaky: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("boom", { status: 503 })
        : gatewayResponse("https://cdn/ok.png");
    };
    const res = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), {
      apiKey: "key",
      fetchImpl: flaky,
      maxRetries: 2,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    const body = await res.json();
    expect(calls).toBe(2);
    expect(res.status).toBe(200);
    expect(body.data.image).toBe("https://cdn/ok.png");
  });

  it("enforces the rate limit with 429 + Retry-After", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const deps = {
      apiKey: "key",
      fetchImpl: okFetch as unknown as typeof fetch,
      rateLimiter: limiter,
    };
    const first = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), deps);
    const second = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const body = await second.json();
    expect(body.error.code).toBe("rate_limited");
  });

  it("maps upstream 402 to credits exhausted", async () => {
    const res = await handleEnhanceImage(makeRequest({ image: VALID_IMAGE }), {
      apiKey: "key",
      fetchImpl: (async () =>
        new Response("no credits", { status: 402 })) as unknown as typeof fetch,
      rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    });
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error.code).toBe("ai_credits_exhausted");
  });
});
