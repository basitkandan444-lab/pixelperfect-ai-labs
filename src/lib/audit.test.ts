import { describe, expect, it } from "vitest";

import {
  attributionLine,
  canonicalJson,
  createAuditRecord,
  currentEngineVersion,
  fnv1a,
  freezeRecord,
  MODEL_CONFIG_HASH,
  summarizeAuditLog,
  type AuditRecord,
} from "./audit";
import type { SessionClassification } from "./intelligence.server";

function fakeClassification(id: string): SessionClassification {
  return {
    session_id: id,
    humanProbability: 0.82,
    automationProbability: 0.18,
    qualityScore: 74,
    confidence: "high",
    segment: "Activated",
    intentScore: 60,
    engagementScore: 55,
    riskLevel: "low",
    evidence: [],
    reasons: [],
    device: "desktop",
    source: "google",
    country: "US",
    duration_ms: 12000,
    events: 8,
    first: "2026-01-01T00:00:00Z",
    last: "2026-01-01T00:00:12Z",
    summary: null,
    rageClicks: 0,
    deadClicks: 0,
  };
}

describe("audit log", () => {
  it("emits deterministic canonical JSON regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("produces stable FNV-1a hashes", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
    expect(fnv1a("hello")).not.toBe(fnv1a("world"));
    expect(MODEL_CONFIG_HASH).toMatch(/^[0-9a-f]{8}$/);
  });

  it("exposes a complete engine version with all required fields", () => {
    const v = currentEngineVersion();
    expect(v.engineVersion).toBeTruthy();
    expect(v.intelligenceVersion).toBeTruthy();
    expect(v.classificationVersion).toBeTruthy();
    expect(v.ruleVersion).toBeTruthy();
    expect(v.weightVersion).toBeTruthy();
    expect(v.scoringVersion).toBeTruthy();
    expect(v.deploymentVersion).toBeTruthy();
    expect(v.buildVersion).toBeTruthy();
    expect(v.modelConfigHash).toBe(MODEL_CONFIG_HASH);
    expect(v.featureFlags.length).toBeGreaterThan(0);
  });

  it("creates a frozen audit record — immutable by construction", () => {
    const rec = createAuditRecord(fakeClassification("s1"), "2026-01-01T00:00:00Z");
    expect(Object.isFrozen(rec)).toBe(true);
    expect(Object.isFrozen(rec.version)).toBe(true);
    expect(() => {
      (rec as unknown as { qualityScore: number }).qualityScore = 0;
    }).toThrow();
  });

  it("attribution line names the engine version", () => {
    const rec = createAuditRecord(fakeClassification("s1"), "2026-01-01T00:00:00Z");
    const line = attributionLine(rec);
    expect(line).toContain("Engine v");
    expect(line).toContain(rec.version.engineVersion);
    expect(line).toContain(rec.version.modelConfigHash);
  });

  it("summarizes an audit log across engine + rule + deployment versions", () => {
    const r1 = createAuditRecord(fakeClassification("s1"), "2026-01-01T00:00:00Z");
    const r2 = createAuditRecord(fakeClassification("s2"), "2026-01-02T00:00:00Z");
    const summary = summarizeAuditLog([r1, r2]);
    expect(summary.totalRecords).toBe(2);
    expect(summary.engineVersions).toHaveLength(1);
    expect(summary.engineVersions[0].count).toBe(2);
    expect(summary.engineVersions[0].earliest).toBe("2026-01-01T00:00:00Z");
    expect(summary.engineVersions[0].latest).toBe("2026-01-02T00:00:00Z");
    expect(summary.deploymentTimeline).toHaveLength(1);
    expect(summary.current.engineVersion).toBe(r1.version.engineVersion);
  });

  it("historical records survive an in-memory engine bump — no rewrite path exists", () => {
    const rec = createAuditRecord(fakeClassification("s1"), "2026-01-01T00:00:00Z") as AuditRecord;
    const originalVersion = rec.version.engineVersion;
    // The audit module has no update/delete API. Simulate a future upgrade by
    // creating a NEW record — the old one is untouched.
    const later = createAuditRecord(fakeClassification("s1"), "2027-01-01T00:00:00Z");
    expect(rec.version.engineVersion).toBe(originalVersion);
    expect(later.classifiedAt).toBe("2027-01-01T00:00:00Z");
  });

  it("freezeRecord deeply freezes nested objects", () => {
    const obj = freezeRecord({ a: { b: 1 } });
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.a)).toBe(true);
  });
});
