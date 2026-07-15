// Alert delivery layer — pure, unit-testable pieces.
//
// Given detected reliability alerts, compute a stable dedup key per (kind,
// evidence signature) so the same anomaly does not spam every 5 minutes.
// Actual persistence + webhook POSTing lives in the /api/public/hooks/reliability-scan
// route; this module keeps the deterministic logic separate so it can be tested.

import type { ReliabilityAlert } from "@/lib/reliability";

export interface DeliverableAlert {
  kind: ReliabilityAlert["kind"];
  dedup_key: string;
  severity: ReliabilityAlert["severity"];
  title: string;
  detail: string;
  recommendation: string;
  evidence: ReliabilityAlert["evidence"];
}

/**
 * Build a stable dedup key for an alert. We collapse the continuous evidence
 * to a coarse bucket so the same ongoing incident hashes identically across
 * consecutive scans, but a materially different anomaly gets a new row.
 */
export function dedupKey(alert: ReliabilityAlert): string {
  const bucket = (n: number, step: number) => Math.round(n / step) * step;
  const ev = alert.evidence;
  const parts = [
    alert.kind,
    alert.severity,
    alert.kind === "new_error_code" ? alert.id : "",
    Number.isFinite(ev.change) ? bucket(ev.change * 100, 10).toString() : "",
  ];
  return parts.filter(Boolean).join("|");
}

export function toDeliverable(alert: ReliabilityAlert): DeliverableAlert {
  return {
    kind: alert.kind,
    dedup_key: dedupKey(alert),
    severity: alert.severity,
    title: alert.title,
    detail: alert.detail,
    recommendation: alert.recommendation,
    evidence: alert.evidence,
  };
}

/**
 * Format the webhook payload sent to RELIABILITY_ALERT_WEBHOOK_URL. Kept flat
 * and provider-agnostic (Slack, Discord, generic HTTP) — consumers can adapt.
 */
export function webhookPayload(alert: DeliverableAlert, source: string) {
  return {
    source,
    kind: alert.kind,
    severity: alert.severity,
    title: alert.title,
    detail: alert.detail,
    recommendation: alert.recommendation,
    evidence: alert.evidence,
    // Also embed a Slack-compatible `text` field for quick smoke tests.
    text: `[${alert.severity.toUpperCase()}] ${alert.title} — ${alert.detail}`,
  };
}
