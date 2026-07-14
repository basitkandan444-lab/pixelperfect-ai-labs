// Intelligence Audit Log — Enterprise Operations
//
// Records the exact engine + rule + weight versions that produced every
// classification, so historical scores remain interpretable even after the
// engine is upgraded. Records are treated as immutable: `freezeRecord` deep
// freezes every returned object, and there is no update/delete path.
//
// Privacy: audit records never carry PII. They store version constants, a
// deterministic hash of the scoring configuration, and the per-session
// classification summary (probability, quality, confidence, risk tier).

import { BUILD_INFO, releaseTag } from "./build-info";
import type { Classification } from "./intelligence.server";

export const ENGINE_VERSION = "3.0.0";
export const INTELLIGENCE_VERSION = "3.0.0";
export const CLASSIFICATION_VERSION = "2025.07.14";
export const RULE_VERSION = "rules-2025.07.14-a";
export const WEIGHT_VERSION = "weights-2025.07.14-a";
export const SCORING_VERSION = "scoring-v3";
export const FEATURE_FLAGS = [
  "behavior-summary-v2",
  "rage-click-detection",
  "dead-click-detection",
  "web-vitals-signals",
  "explainable-classification",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export interface EngineVersion {
  engineVersion: string;
  intelligenceVersion: string;
  classificationVersion: string;
  ruleVersion: string;
  weightVersion: string;
  scoringVersion: string;
  deploymentVersion: string;
  buildVersion: string;
  buildCommit: string;
  buildTime: string;
  modelConfigHash: string;
  featureFlags: readonly FeatureFlag[];
}

/** Deterministic 32-bit FNV-1a hex hash — no crypto dep, stable across runs. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Canonical JSON stringify (sorted keys) — stable hash across environments. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}"
  );
}

const MODEL_CONFIG = {
  rules: RULE_VERSION,
  weights: WEIGHT_VERSION,
  scoring: SCORING_VERSION,
  flags: [...FEATURE_FLAGS],
};

export const MODEL_CONFIG_HASH = fnv1a(canonicalJson(MODEL_CONFIG));

export function currentEngineVersion(): EngineVersion {
  return Object.freeze({
    engineVersion: ENGINE_VERSION,
    intelligenceVersion: INTELLIGENCE_VERSION,
    classificationVersion: CLASSIFICATION_VERSION,
    ruleVersion: RULE_VERSION,
    weightVersion: WEIGHT_VERSION,
    scoringVersion: SCORING_VERSION,
    deploymentVersion: releaseTag(),
    buildVersion: BUILD_INFO.version,
    buildCommit: BUILD_INFO.commit,
    buildTime: BUILD_INFO.buildTime,
    modelConfigHash: MODEL_CONFIG_HASH,
    featureFlags: FEATURE_FLAGS,
  });
}

// ---------- Audit records ----------

export interface AuditRecord {
  sessionId: string;
  classifiedAt: string; // ISO
  humanProbability: number;
  qualityScore: number;
  confidence: string;
  riskTier: string;
  version: EngineVersion;
}

/** Freeze an audit record so it cannot be mutated after creation. */
export function freezeRecord<T extends object>(r: T): Readonly<T> {
  Object.freeze(r);
  for (const k of Object.keys(r) as (keyof T)[]) {
    const v = r[k];
    if (v && typeof v === "object" && !Object.isFrozen(v)) Object.freeze(v);
  }
  return r;
}

export function createAuditRecord(
  c: Classification,
  now: string = new Date().toISOString(),
): AuditRecord {
  return freezeRecord({
    sessionId: c.session_id,
    classifiedAt: now,
    humanProbability: c.humanProbability,
    qualityScore: c.qualityScore,
    confidence: c.confidence,
    riskTier: c.riskTier,
    version: currentEngineVersion(),
  });
}

export interface AuditLogSummary {
  totalRecords: number;
  engineVersions: { engineVersion: string; count: number; earliest: string; latest: string }[];
  ruleVersions: { ruleVersion: string; count: number }[];
  weightVersions: { weightVersion: string; count: number }[];
  modelConfigHashes: { hash: string; count: number }[];
  deploymentTimeline: { deploymentVersion: string; earliest: string; latest: string; count: number }[];
  current: EngineVersion;
}

export function summarizeAuditLog(records: AuditRecord[]): AuditLogSummary {
  const bucket = <K extends string>(pick: (r: AuditRecord) => K) => {
    const m = new Map<K, { count: number; earliest: string; latest: string }>();
    for (const r of records) {
      const k = pick(r);
      const e = m.get(k);
      if (!e) m.set(k, { count: 1, earliest: r.classifiedAt, latest: r.classifiedAt });
      else {
        e.count++;
        if (r.classifiedAt < e.earliest) e.earliest = r.classifiedAt;
        if (r.classifiedAt > e.latest) e.latest = r.classifiedAt;
      }
    }
    return m;
  };
  const engines = bucket((r) => r.version.engineVersion);
  const rules = bucket((r) => r.version.ruleVersion);
  const weights = bucket((r) => r.version.weightVersion);
  const hashes = bucket((r) => r.version.modelConfigHash);
  const deploys = bucket((r) => r.version.deploymentVersion);

  return {
    totalRecords: records.length,
    engineVersions: [...engines].map(([engineVersion, v]) => ({ engineVersion, ...v })),
    ruleVersions: [...rules].map(([ruleVersion, v]) => ({ ruleVersion, count: v.count })),
    weightVersions: [...weights].map(([weightVersion, v]) => ({
      weightVersion,
      count: v.count,
    })),
    modelConfigHashes: [...hashes].map(([hash, v]) => ({ hash, count: v.count })),
    deploymentTimeline: [...deploys]
      .map(([deploymentVersion, v]) => ({ deploymentVersion, ...v }))
      .sort((a, b) => a.earliest.localeCompare(b.earliest)),
    current: currentEngineVersion(),
  };
}

/** Human-readable single-line attribution for a classified session. */
export function attributionLine(r: AuditRecord): string {
  return `This visitor was classified using Engine v${r.version.engineVersion} (rules ${r.version.ruleVersion}, weights ${r.version.weightVersion}, hash ${r.version.modelConfigHash}) on ${r.classifiedAt}.`;
}
