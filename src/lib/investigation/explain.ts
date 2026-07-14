// Investigation Explainability.
//
// Renders a plain-language explanation for a classification: why it landed
// where it did, split by positive / negative / conflicting evidence, and a
// per-driver breakdown for quality, confidence, and risk. Never fabricates:
// every claim maps directly to at least one evidence signal.

import type { SessionClassification } from "../intelligence.server";

export interface InvestigationExplanation {
  headline: string;
  segment: string;
  humanProbabilityPct: number;
  automationProbabilityPct: number;
  qualityScore: number;
  confidence: string;
  risk: string;
  positive: { signal: string; weight: number }[];
  negative: { signal: string; weight: number }[];
  conflicting: { signal: string; weight: number }[];
  drivers: {
    quality: string[];
    confidence: string[];
    risk: string[];
  };
  narrative: string;
}

export function explainInvestigation(c: SessionClassification): InvestigationExplanation {
  const positive = c.evidence
    .filter((e) => e.direction === "positive")
    .sort((a, b) => b.weight - a.weight)
    .map((e) => ({ signal: e.signal, weight: e.weight }));
  const negative = c.evidence
    .filter((e) => e.direction === "negative")
    .sort((a, b) => b.weight - a.weight)
    .map((e) => ({ signal: e.signal, weight: e.weight }));

  // Conflicting = signals whose text appears in BOTH positive and negative
  // frames (e.g. "reading behavior" positive + "abandoned quickly" negative
  // sharing the "reading" root). Detected by shared token bags.
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4),
    );
  const conflicting: { signal: string; weight: number }[] = [];
  for (const p of positive) {
    const pt = tok(p.signal);
    for (const n of negative) {
      const nt = tok(n.signal);
      const shared = [...pt].filter((t) => nt.has(t));
      if (shared.length >= 1) {
        conflicting.push({ signal: `${p.signal} vs ${n.signal}`, weight: p.weight + n.weight });
      }
    }
  }

  const pos = positive.reduce((a, b) => a + b.weight, 0);
  const neg = negative.reduce((a, b) => a + b.weight, 0);
  const qualityDrivers: string[] = [];
  if (pos > 0)
    qualityDrivers.push(`+${pos.toFixed(0)} points from ${positive.length} positive signal(s)`);
  if (neg > 0)
    qualityDrivers.push(`-${neg.toFixed(0)} points from ${negative.length} negative signal(s)`);
  if (positive[0]) qualityDrivers.push(`Strongest positive: ${positive[0].signal}`);
  if (negative[0]) qualityDrivers.push(`Strongest negative: ${negative[0].signal}`);

  const total = pos + neg;
  const confidenceDrivers: string[] = [];
  confidenceDrivers.push(`Total evidence points: ${total.toFixed(0)}`);
  confidenceDrivers.push(`Confidence tier: ${c.confidence}`);
  if (c.events < 4) confidenceDrivers.push("Short session (fewer than 4 events)");
  else confidenceDrivers.push(`${c.events} recorded events`);
  if (c.duration_ms < 10_000) confidenceDrivers.push("Under 10s duration");
  else confidenceDrivers.push(`${Math.round(c.duration_ms / 1000)}s duration`);

  const riskDrivers: string[] = [];
  riskDrivers.push(`Automation probability: ${(c.automationProbability * 100).toFixed(1)}%`);
  riskDrivers.push(`Risk tier: ${c.riskLevel}`);
  if (c.riskLevel === "high" && negative[0])
    riskDrivers.push(`Primary risk driver: ${negative[0].signal}`);

  const headline =
    c.humanProbability >= 0.7
      ? `Likely human (${(c.humanProbability * 100).toFixed(0)}% confidence)`
      : c.automationProbability >= 0.7
        ? `Likely automation (${(c.automationProbability * 100).toFixed(0)}% confidence)`
        : `Ambiguous session (${(c.humanProbability * 100).toFixed(0)}% human · ${(c.automationProbability * 100).toFixed(0)}% automation)`;

  const narrative = [
    `${headline}. Classified as "${c.segment}" with ${c.confidence} confidence and ${c.riskLevel} risk.`,
    positive.length > 0
      ? `Positive evidence includes: ${positive
          .slice(0, 3)
          .map((e) => e.signal)
          .join("; ")}.`
      : "",
    negative.length > 0
      ? `Negative evidence includes: ${negative
          .slice(0, 3)
          .map((e) => e.signal)
          .join("; ")}.`
      : "",
    conflicting.length > 0 ? `${conflicting.length} conflicting signal pair(s) detected.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    headline,
    segment: c.segment,
    humanProbabilityPct: +(c.humanProbability * 100).toFixed(2),
    automationProbabilityPct: +(c.automationProbability * 100).toFixed(2),
    qualityScore: c.qualityScore,
    confidence: c.confidence,
    risk: c.riskLevel,
    positive,
    negative,
    conflicting,
    drivers: { quality: qualityDrivers, confidence: confidenceDrivers, risk: riskDrivers },
    narrative,
  };
}
