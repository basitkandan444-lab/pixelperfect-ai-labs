// Session Comparison Workspace — pure diff engine.
//
// Compares any number of session classifications side-by-side. Highlights
// differences automatically by computing, per numeric field, the range of
// values; boolean fields flag disagreement; array fields report symmetric
// difference.

import type { SessionClassification } from "../intelligence.server";

export interface ComparisonRow {
  field: string;
  values: (string | number | null)[];
  differs: boolean;
  spread?: number; // numeric range
}

export interface ComparisonReport {
  sessions: string[];
  rows: ComparisonRow[];
  summary: string;
  differCount: number;
}

const NUMERIC_FIELDS: (keyof SessionClassification)[] = [
  "humanProbability",
  "automationProbability",
  "qualityScore",
  "intentScore",
  "engagementScore",
  "duration_ms",
  "events",
  "rageClicks",
  "deadClicks",
];
const STRING_FIELDS: (keyof SessionClassification)[] = [
  "segment",
  "confidence",
  "riskLevel",
  "device",
  "source",
  "country",
];

function fmt(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? +v.toFixed(4) : null;
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  return null;
}

export function compareSessions(classifications: SessionClassification[]): ComparisonReport {
  const rows: ComparisonRow[] = [];
  const sessions = classifications.map((c) => c.session_id);

  for (const f of NUMERIC_FIELDS) {
    const vals = classifications.map((c) => c[f] as number);
    const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const differs = nums.length >= 2 && Math.max(...nums) - Math.min(...nums) > 1e-9;
    rows.push({
      field: f as string,
      values: vals.map((v) => (typeof v === "number" ? +v.toFixed(4) : null)),
      differs,
      spread: nums.length > 0 ? Math.max(...nums) - Math.min(...nums) : 0,
    });
  }

  for (const f of STRING_FIELDS) {
    const vals = classifications.map((c) => fmt(c[f]));
    const uniq = new Set(vals.map((v) => (v === null ? "\0null" : v)));
    rows.push({ field: f as string, values: vals, differs: uniq.size > 1 });
  }

  // Evidence sets — symmetric difference across all sessions.
  const evidenceSets = classifications.map((c) => new Set(c.evidence.map((e) => e.signal)));
  const union = new Set<string>();
  for (const s of evidenceSets) for (const sig of s) union.add(sig);
  let sharedCount = 0;
  for (const sig of union) if (evidenceSets.every((s) => s.has(sig))) sharedCount += 1;
  const evidenceDiffers = classifications.length > 1 && sharedCount < union.size;
  rows.push({
    field: "evidence.signals",
    values: evidenceSets.map((s) => s.size),
    differs: evidenceDiffers,
  });

  const differCount = rows.filter((r) => r.differs).length;
  const summary =
    classifications.length < 2
      ? `Select at least two sessions to compare.`
      : `${differCount} of ${rows.length} fields differ across ${classifications.length} sessions.`;

  return { sessions, rows, summary, differCount };
}
