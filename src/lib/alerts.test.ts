import { describe, expect, it } from "vitest";

import { dedupKey, toDeliverable, webhookPayload } from "@/lib/alerts";
import type { ReliabilityAlert } from "@/lib/reliability";

function makeAlert(overrides: Partial<ReliabilityAlert> = {}): ReliabilityAlert {
  return {
    id: "error_spike",
    kind: "error_spike",
    severity: "warning",
    title: "Error volume increased 200%",
    detail: "Errors rose",
    evidence: { baseline: 10, current: 30, change: 2, samples: { baseline: 100, current: 120 } },
    recommendation: "Investigate",
    at: "2026-07-15T10:00:00Z",
    ...overrides,
  };
}

describe("alerts", () => {
  it("dedupKey is stable for similar evidence", () => {
    const a = makeAlert({ evidence: { baseline: 10, current: 30, change: 2.03, samples: { baseline: 100, current: 120 } } });
    const b = makeAlert({ evidence: { baseline: 12, current: 34, change: 1.97, samples: { baseline: 100, current: 120 } } });
    expect(dedupKey(a)).toBe(dedupKey(b));
  });

  it("dedupKey changes for material shifts", () => {
    const mild = makeAlert({ evidence: { baseline: 10, current: 15, change: 0.5, samples: { baseline: 100, current: 120 } } });
    const severe = makeAlert({ evidence: { baseline: 10, current: 100, change: 9, samples: { baseline: 100, current: 120 } } });
    expect(dedupKey(mild)).not.toBe(dedupKey(severe));
  });

  it("dedupKey includes error code for new_error_code kind", () => {
    const a = makeAlert({ kind: "new_error_code", id: "new_error:PAYLOAD_TOO_LARGE" });
    const b = makeAlert({ kind: "new_error_code", id: "new_error:INVALID_MIME" });
    expect(dedupKey(a)).not.toBe(dedupKey(b));
  });

  it("toDeliverable strips transient fields", () => {
    const d = toDeliverable(makeAlert());
    expect(d).not.toHaveProperty("at");
    expect(d).not.toHaveProperty("id");
    expect(d.kind).toBe("error_spike");
    expect(d.dedup_key.length).toBeGreaterThan(0);
  });

  it("webhookPayload includes a human-readable text summary", () => {
    const payload = webhookPayload(toDeliverable(makeAlert({ severity: "critical" })), "pixelperfect");
    expect(payload.text).toContain("CRITICAL");
    expect(payload.text).toContain("Error volume");
    expect(payload.source).toBe("pixelperfect");
  });
});
