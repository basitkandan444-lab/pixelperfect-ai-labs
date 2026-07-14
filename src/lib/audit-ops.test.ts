import { describe, expect, it } from "vitest";

import type { AuditRecord, EngineVersion } from "./audit";
import { currentEngineVersion } from "./audit";
import {
  diffEngineVersions,
  verifyAuditLog,
  versionHistoryTimeline,
} from "./audit-ops";

function rec(
  sessionId: string,
  classifiedAt: string,
  overrides: Partial<EngineVersion> = {},
): AuditRecord {
  const v = currentEngineVersion();
  return {
    sessionId,
    classifiedAt,
    humanProbability: 0.9,
    qualityScore: 80,
    confidence: "high",
    riskTier: "low",
    version: { ...v, ...overrides },
  };
}

describe("verifyAuditLog", () => {
  it("passes for a well-ordered stream", () => {
    const v = verifyAuditLog([
      rec("s1", "2026-07-14T10:00:00Z"),
      rec("s1", "2026-07-14T11:00:00Z"),
      rec("s2", "2026-07-14T10:30:00Z"),
    ]);
    expect(v.ok).toBe(true);
    expect(v.outOfOrder).toBe(0);
    expect(v.duplicateRecords).toBe(0);
  });

  it("flags out-of-order per session", () => {
    const v = verifyAuditLog([
      rec("s1", "2026-07-14T11:00:00Z"),
      rec("s1", "2026-07-14T10:00:00Z"),
    ]);
    expect(v.ok).toBe(false);
    expect(v.outOfOrder).toBe(1);
    expect(v.issues[0].code).toBe("out-of-order");
  });

  it("flags duplicates and invalid records", () => {
    const bad = { classifiedAt: "2026-07-14T10:00:00Z" } as unknown as AuditRecord;
    const v = verifyAuditLog([
      rec("s1", "2026-07-14T10:00:00Z"),
      rec("s1", "2026-07-14T10:00:00Z"),
      bad,
    ]);
    expect(v.duplicateRecords).toBe(1);
    expect(v.invalidRecords).toBe(1);
    expect(v.ok).toBe(false);
  });
});

describe("versionHistoryTimeline", () => {
  it("groups consecutive same-hash records into windows", () => {
    const v1 = currentEngineVersion();
    const v2 = { ...v1, engineVersion: "9.9.9", modelConfigHash: "deadbeef" };
    const records: AuditRecord[] = [
      rec("s1", "2026-07-14T10:00:00Z"),
      rec("s2", "2026-07-14T10:05:00Z"),
      rec("s3", "2026-07-14T10:10:00Z", v2),
      rec("s4", "2026-07-14T10:15:00Z", v2),
      rec("s5", "2026-07-14T10:20:00Z"),
    ];
    const tl = versionHistoryTimeline(records);
    expect(tl).toHaveLength(3);
    expect(tl[0].records).toBe(2);
    expect(tl[1].version.engineVersion).toBe("9.9.9");
    expect(tl[1].to).toBe("2026-07-14T10:15:00Z");
  });
});

describe("diffEngineVersions", () => {
  it("returns identical when equal", () => {
    const a = currentEngineVersion();
    expect(diffEngineVersions(a, a).identical).toBe(true);
  });

  it("reports changed fields and feature flag deltas", () => {
    const a = currentEngineVersion();
    const b: EngineVersion = {
      ...a,
      engineVersion: "9.0.0",
      modelConfigHash: "abcdef01",
      featureFlags: [...a.featureFlags.filter((f) => f !== "web-vitals-signals"), "loop-1-1"] as unknown as EngineVersion["featureFlags"],
    };
    const d = diffEngineVersions(a, b);
    expect(d.identical).toBe(false);
    expect(d.changed.some((c) => c.field === "engineVersion")).toBe(true);
    expect(d.changed.some((c) => c.field === "modelConfigHash")).toBe(true);
    expect(d.featureFlagsAdded).toContain("loop-1-1");
    expect(d.featureFlagsRemoved).toContain("web-vitals-signals");
  });
});
