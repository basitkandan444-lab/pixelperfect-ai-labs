// Loop 1.1 — Audit operations: append-only verification, version history
// timeline, and version diff. Pure functions only.

import type { AuditRecord, EngineVersion } from "./audit";

// ---------- Append-only verification ----------

export interface AuditIssue {
  code: "invalid-record" | "duplicate" | "out-of-order" | "hash-flip";
  message: string;
  sessionId?: string;
  at?: string;
}

export interface AuditVerification {
  ok: boolean;
  totalRecords: number;
  outOfOrder: number;
  invalidRecords: number;
  duplicateRecords: number;
  hashFlips: number; // same session revisited with a different model hash going backward in time
  issues: AuditIssue[]; // capped
}

const MAX_ISSUES = 50;

/**
 * Verify that a stream of persisted `AuditRecord`s satisfies append-only
 * invariants: no missing fields, no duplicates, no per-session records
 * whose `classifiedAt` predates a previously written record for the same
 * session, and no retroactive model-hash rewrites of the past.
 */
export function verifyAuditLog(records: AuditRecord[]): AuditVerification {
  const issues: AuditIssue[] = [];
  const lastAtBySession = new Map<string, string>();
  const lastHashBySession = new Map<string, string>();
  const seen = new Set<string>();
  let outOfOrder = 0;
  let invalid = 0;
  let dupes = 0;
  let hashFlips = 0;

  for (const r of records) {
    if (
      !r ||
      typeof r !== "object" ||
      !r.sessionId ||
      !r.classifiedAt ||
      !r.version ||
      !r.version.modelConfigHash ||
      !r.version.engineVersion
    ) {
      invalid++;
      if (issues.length < MAX_ISSUES) {
        issues.push({ code: "invalid-record", message: "Missing required fields" });
      }
      continue;
    }
    const key = `${r.sessionId}|${r.classifiedAt}|${r.version.modelConfigHash}`;
    if (seen.has(key)) {
      dupes++;
      if (issues.length < MAX_ISSUES) {
        issues.push({
          code: "duplicate",
          message: "Duplicate audit record",
          sessionId: r.sessionId,
          at: r.classifiedAt,
        });
      }
    }
    seen.add(key);

    const prevAt = lastAtBySession.get(r.sessionId);
    if (prevAt && prevAt > r.classifiedAt) {
      outOfOrder++;
      if (issues.length < MAX_ISSUES) {
        issues.push({
          code: "out-of-order",
          message: `Record ${r.classifiedAt} predates prior ${prevAt}`,
          sessionId: r.sessionId,
          at: r.classifiedAt,
        });
      }
    }
    const prevHash = lastHashBySession.get(r.sessionId);
    if (
      prevAt &&
      prevHash &&
      prevAt <= r.classifiedAt &&
      prevHash !== r.version.modelConfigHash &&
      r.classifiedAt < prevAt
    ) {
      // Backward-in-time rewrite of the model hash for this session.
      hashFlips++;
      if (issues.length < MAX_ISSUES) {
        issues.push({
          code: "hash-flip",
          message: "Retroactive model-hash change detected",
          sessionId: r.sessionId,
          at: r.classifiedAt,
        });
      }
    }

    if (!prevAt || r.classifiedAt >= prevAt) {
      lastAtBySession.set(r.sessionId, r.classifiedAt);
      lastHashBySession.set(r.sessionId, r.version.modelConfigHash);
    }
  }

  return {
    ok: outOfOrder === 0 && invalid === 0 && dupes === 0 && hashFlips === 0,
    totalRecords: records.length,
    outOfOrder,
    invalidRecords: invalid,
    duplicateRecords: dupes,
    hashFlips,
    issues,
  };
}

// ---------- Version history timeline ----------

export interface VersionWindow {
  from: string;
  to: string;
  version: EngineVersion;
  records: number;
}

/**
 * Chronological windows of consecutive records sharing the same engine
 * version + model config hash. Great for a "what was live when" view.
 */
export function versionHistoryTimeline(records: AuditRecord[]): VersionWindow[] {
  const sorted = [...records]
    .filter((r) => r && r.version && r.classifiedAt)
    .sort((a, b) => a.classifiedAt.localeCompare(b.classifiedAt));

  const out: VersionWindow[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.version.engineVersion === r.version.engineVersion &&
      last.version.modelConfigHash === r.version.modelConfigHash
    ) {
      last.to = r.classifiedAt;
      last.records++;
    } else {
      out.push({ from: r.classifiedAt, to: r.classifiedAt, version: r.version, records: 1 });
    }
  }
  return out;
}

// ---------- Version diff ----------

const DIFF_FIELDS = [
  "engineVersion",
  "intelligenceVersion",
  "classificationVersion",
  "ruleVersion",
  "weightVersion",
  "scoringVersion",
  "deploymentVersion",
  "buildVersion",
  "buildCommit",
  "buildTime",
  "modelConfigHash",
] as const satisfies readonly (keyof EngineVersion)[];

export interface VersionDiff {
  identical: boolean;
  changed: { field: (typeof DIFF_FIELDS)[number]; from: string; to: string }[];
  featureFlagsAdded: string[];
  featureFlagsRemoved: string[];
}

export function diffEngineVersions(a: EngineVersion, b: EngineVersion): VersionDiff {
  const changed: VersionDiff["changed"] = [];
  for (const f of DIFF_FIELDS) {
    if (a[f] !== b[f]) {
      changed.push({ field: f, from: String(a[f]), to: String(b[f]) });
    }
  }
  const aFlags = new Set<string>(a.featureFlags);
  const bFlags = new Set<string>(b.featureFlags);
  const added = [...bFlags].filter((x) => !aFlags.has(x));
  const removed = [...aFlags].filter((x) => !bFlags.has(x));
  return {
    identical: changed.length === 0 && added.length === 0 && removed.length === 0,
    changed,
    featureFlagsAdded: added,
    featureFlagsRemoved: removed,
  };
}
