// Loop 2 — Enterprise Rule Sandbox Engine.
//
// A configurable rule set for the classification pipeline. The sandbox
// engine re-scores an already-classified session against these rules without
// touching production scoring. Every category is a plain multiplier applied
// to matching evidence weights; every threshold is a plain scalar.
//
// Nothing here talks to Supabase or the DOM — pure data + pure functions.

export interface RuleWeights {
  rageClick: number;
  deadClick: number;
  scroll: number;
  hover: number;
  idle: number;
  mouseRhythm: number;
  clickRhythm: number;
  reading: number;
  network: number;
  performance: number;
}

export interface RuleThresholds {
  /** Evidence points required for HIGH confidence. */
  evidenceHigh: number;
  /** Evidence points required for MEDIUM confidence. */
  evidenceMedium: number;
  /** Human probability considered clearly human (narrative). */
  humanHigh: number;
  /** Human probability considered clearly non-human (narrative). */
  humanLow: number;
  /** Automation probability required for HIGH risk. */
  automationHigh: number;
  /** Automation probability required for MEDIUM risk. */
  automationMedium: number;
  /** Evidence points required alongside `automationHigh` for HIGH risk. */
  riskEvidenceMin: number;
}

export interface RuleSet {
  weights: RuleWeights;
  thresholds: RuleThresholds;
}

/** Defaults mirror the production classifier at scoring-v3. */
export const DEFAULT_RULES: RuleSet = Object.freeze({
  weights: Object.freeze({
    rageClick: 1,
    deadClick: 1,
    scroll: 1,
    hover: 1,
    idle: 1,
    mouseRhythm: 1,
    clickRhythm: 1,
    reading: 1,
    network: 1,
    performance: 1,
  }),
  thresholds: Object.freeze({
    evidenceHigh: 30,
    evidenceMedium: 15,
    humanHigh: 0.75,
    humanLow: 0.25,
    automationHigh: 0.7,
    automationMedium: 0.4,
    riskEvidenceMin: 30,
  }),
}) as RuleSet;

// ---------- Parameter metadata ----------

export type WeightKey = keyof RuleWeights;
export type ThresholdKey = keyof RuleThresholds;

export const WEIGHT_META: Record<WeightKey, { label: string; min: number; max: number }> = {
  rageClick: { label: "Rage click penalty", min: 0, max: 3 },
  deadClick: { label: "Dead click penalty", min: 0, max: 3 },
  scroll: { label: "Scroll weight", min: 0, max: 3 },
  hover: { label: "Hover weight", min: 0, max: 3 },
  idle: { label: "Idle weight", min: 0, max: 3 },
  mouseRhythm: { label: "Mouse rhythm weight", min: 0, max: 3 },
  clickRhythm: { label: "Click rhythm weight", min: 0, max: 3 },
  reading: { label: "Reading score weight", min: 0, max: 3 },
  network: { label: "Network weight", min: 0, max: 3 },
  performance: { label: "Performance weight", min: 0, max: 3 },
};

export const THRESHOLD_META: Record<
  ThresholdKey,
  { label: string; min: number; max: number }
> = {
  evidenceHigh: { label: "Confidence: HIGH evidence points", min: 0, max: 200 },
  evidenceMedium: { label: "Confidence: MEDIUM evidence points", min: 0, max: 200 },
  humanHigh: { label: "Human probability (narrative high)", min: 0, max: 1 },
  humanLow: { label: "Human probability (narrative low)", min: 0, max: 1 },
  automationHigh: { label: "Automation probability (risk HIGH)", min: 0, max: 1 },
  automationMedium: { label: "Automation probability (risk MEDIUM)", min: 0, max: 1 },
  riskEvidenceMin: { label: "Risk HIGH: min evidence points", min: 0, max: 200 },
};

// ---------- Validation ----------

export interface ValidationIssue {
  code:
    | "weight-out-of-range"
    | "weight-non-finite"
    | "threshold-out-of-range"
    | "threshold-non-finite"
    | "threshold-conflict";
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateRuleSet(rules: RuleSet): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const [k, meta] of Object.entries(WEIGHT_META) as [WeightKey, (typeof WEIGHT_META)[WeightKey]][]) {
    const v = rules.weights[k];
    if (!Number.isFinite(v)) {
      issues.push({ code: "weight-non-finite", field: `weights.${k}`, message: "Weight must be a finite number" });
    } else if (v < meta.min || v > meta.max) {
      issues.push({
        code: "weight-out-of-range",
        field: `weights.${k}`,
        message: `${meta.label} must be within [${meta.min}, ${meta.max}]`,
      });
    }
  }
  for (const [k, meta] of Object.entries(THRESHOLD_META) as [ThresholdKey, (typeof THRESHOLD_META)[ThresholdKey]][]) {
    const v = rules.thresholds[k];
    if (!Number.isFinite(v)) {
      issues.push({ code: "threshold-non-finite", field: `thresholds.${k}`, message: "Threshold must be a finite number" });
    } else if (v < meta.min || v > meta.max) {
      issues.push({
        code: "threshold-out-of-range",
        field: `thresholds.${k}`,
        message: `${meta.label} must be within [${meta.min}, ${meta.max}]`,
      });
    }
  }
  const t = rules.thresholds;
  if (t.evidenceHigh <= t.evidenceMedium) {
    issues.push({
      code: "threshold-conflict",
      field: "thresholds.evidenceHigh",
      message: "evidenceHigh must be greater than evidenceMedium",
    });
  }
  if (t.humanHigh <= t.humanLow) {
    issues.push({
      code: "threshold-conflict",
      field: "thresholds.humanHigh",
      message: "humanHigh must be greater than humanLow",
    });
  }
  if (t.automationHigh <= t.automationMedium) {
    issues.push({
      code: "threshold-conflict",
      field: "thresholds.automationHigh",
      message: "automationHigh must be greater than automationMedium",
    });
  }
  return { ok: issues.length === 0, issues };
}

// ---------- Diff ----------

export interface RuleParamDiff {
  key: string;
  label: string;
  current: number;
  proposed: number;
  delta: number;
  min: number;
  max: number;
  inRange: boolean;
}

export function diffRuleSets(current: RuleSet, proposed: RuleSet): RuleParamDiff[] {
  const out: RuleParamDiff[] = [];
  for (const [k, meta] of Object.entries(WEIGHT_META) as [WeightKey, (typeof WEIGHT_META)[WeightKey]][]) {
    const cur = current.weights[k];
    const prop = proposed.weights[k];
    out.push({
      key: `weights.${k}`,
      label: meta.label,
      current: cur,
      proposed: prop,
      delta: prop - cur,
      min: meta.min,
      max: meta.max,
      inRange: Number.isFinite(prop) && prop >= meta.min && prop <= meta.max,
    });
  }
  for (const [k, meta] of Object.entries(THRESHOLD_META) as [ThresholdKey, (typeof THRESHOLD_META)[ThresholdKey]][]) {
    const cur = current.thresholds[k];
    const prop = proposed.thresholds[k];
    out.push({
      key: `thresholds.${k}`,
      label: meta.label,
      current: cur,
      proposed: prop,
      delta: prop - cur,
      min: meta.min,
      max: meta.max,
      inRange: Number.isFinite(prop) && prop >= meta.min && prop <= meta.max,
    });
  }
  return out;
}

/** Deep-merge a partial rule set on top of defaults. */
export function mergeRules(partial?: Partial<RuleSet> | null): RuleSet {
  return {
    weights: { ...DEFAULT_RULES.weights, ...(partial?.weights ?? {}) },
    thresholds: { ...DEFAULT_RULES.thresholds, ...(partial?.thresholds ?? {}) },
  };
}

// ---------- Evidence → category mapping ----------

/** Map a production evidence signal to a rule weight category. */
export function categorize(signal: string): WeightKey | null {
  const s = signal.toLowerCase();
  if (s.startsWith("rage-clicked")) return "rageClick";
  if (s.startsWith("dead click")) return "deadClick";
  if (s.includes("scroll")) return "scroll";
  if (s.includes("hover")) return "hover";
  if (s.includes("idle") || s.includes("abandoned")) return "idle";
  if (s.includes("robotic click") || s.includes("natural click") || s.includes("burst click"))
    return "clickRhythm";
  if (s.includes("mouse") || s.includes("cadence") || s.includes("timing"))
    return "mouseRhythm";
  if (s.includes("reading") || s.includes("scanning")) return "reading";
  if (s.includes("rtt") || s.includes("network")) return "network";
  if (s.includes("responsiveness") || s.includes("long tasks") || s.includes("render"))
    return "performance";
  return null;
}
