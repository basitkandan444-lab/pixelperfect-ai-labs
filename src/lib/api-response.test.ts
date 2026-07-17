import { describe, expect, it } from "vitest";

import { jsonFail, jsonOk } from "@/lib/api-response";

// Every route returns these envelopes. The frontend and any external caller
// depend on the exact shape ({ success, data } / { success, error.code }) and
// on responses never being cached. These tests lock that contract.

describe("jsonOk", () => {
  it("wraps data in a success envelope with 200 by default", async () => {
    const res = jsonOk({ image: "x" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { image: "x" } });
  });

  it("sets Cache-Control: no-store so API results are never cached", () => {
    expect(jsonOk({}).headers.get("Cache-Control")).toBe("no-store");
  });

  it("echoes requestId only when provided", async () => {
    expect((await jsonOk({}, { requestId: "abc" }).json()).requestId).toBe("abc");
    expect((await jsonOk({}).json()).requestId).toBeUndefined();
  });

  it("honours a custom status and merges extra headers", () => {
    const res = jsonOk({}, { status: 201, headers: { "X-Test": "1" } });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Test")).toBe("1");
    // Base headers survive the merge.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("jsonFail", () => {
  it("wraps a code + message in a failure envelope, defaulting to 500", async () => {
    const res = jsonFail("boom", "It broke.");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toEqual({ code: "boom", message: "It broke." });
  });

  it("includes details only when supplied", async () => {
    const withDetails = await jsonFail("x", "y", { details: { retryAfterSec: 5 } }).json();
    expect(withDetails.error.details).toEqual({ retryAfterSec: 5 });
    const without = await jsonFail("x", "y").json();
    expect("details" in without.error).toBe(false);
  });

  it("supports rate-limit style status + Retry-After header", () => {
    const res = jsonFail("rate_limited", "slow down", {
      status: 429,
      headers: { "Retry-After": "30" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
