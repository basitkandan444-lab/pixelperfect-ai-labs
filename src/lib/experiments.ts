// A/B testing primitives. Pure, deterministic. Variant assignment is a stable
// hash of (experimentId, session_id), so the same session always falls into
// the same variant across page loads, servers, and workers.
//
// The client emits two events with `metrics.experiment_id` and
// `metrics.variant`:
//   - "experiment_exposure"     (visitor saw the experiment)
//   - "experiment_conversion"   (visitor completed the target action)
//
// `summarizeExperiments` computes lift/p-value **against the declared control
// variant** — never against the alphabetically-first variant. When variant
// metadata isn't supplied, it falls back to the first variant in the summary
// (documented behaviour used only for ad-hoc analysis).

export type Variant = { id: string; weight?: number; is_control?: boolean };

/**
 * Deterministic 32-bit FNV-1a hash. Stable across runtimes.
 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically assign a session to a variant. Weights are relative;
 * missing weight = 1. Returns the variant id.
 */
export function assignVariant(
  experimentId: string,
  sessionId: string,
  variants: Variant[],
): string {
  if (variants.length === 0) throw new Error("assignVariant: empty variants");
  const weights = variants.map((v) => Math.max(0, v.weight ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return variants[0].id;
  const h = hash32(`${experimentId}::${sessionId}`) / 0x100000000; // [0,1)
  let acc = 0;
  for (let i = 0; i < variants.length; i++) {
    acc += weights[i] / total;
    if (h < acc) return variants[i].id;
  }
  return variants[variants.length - 1].id;
}

export type ExperimentEventRow = {
  session_id: string;
  name: string; // "experiment_exposure" | "experiment_conversion" | other
  ts: string;
  metrics?: { experiment_id?: string | null; variant?: string | null } | null;
};

export type VariantSummary = {
  variant: string;
  is_control: boolean;
  exposures: number;
  conversions: number;
  conversion_rate: number;
  /** Relative lift vs the DECLARED control variant. */
  lift_vs_control: number | null;
  /** Two-proportion z-test p-value (two-sided). */
  p_value_vs_control: number | null;
  significant_95: boolean;
};

export type ExperimentSummary = {
  experiment_id: string;
  variants: VariantSummary[];
  total_exposures: number;
  total_conversions: number;
  control_variant: string | null;
};

/** Definition metadata used by `summarizeExperiments` to identify the control. */
export type ExperimentDefinition = {
  id: string;
  key?: string;
  variants: Variant[];
};

/**
 * Aggregate exposure and conversion counts from raw event rows, grouped by
 * experiment_id + variant. Each session counts at most once toward exposures
 * and at most once toward conversions per (experiment, variant).
 *
 * When `definitions` is provided, `is_control` and lift are computed against
 * the explicit control variant. Otherwise falls back to the first-seen
 * variant (unsafe for decisions; used only for exploratory analysis).
 */
export function summarizeExperiments(
  events: ExperimentEventRow[],
  definitions: ExperimentDefinition[] = [],
): ExperimentSummary[] {
  type Bucket = { exposures: Set<string>; conversions: Set<string> };
  const byExp = new Map<string, Map<string, Bucket>>();
  const controlByExp = new Map<string, string>();
  for (const d of definitions) {
    const c = d.variants.find((v) => v.is_control);
    if (c) controlByExp.set(d.id, c.id);
  }

  for (const e of events) {
    if (e.name !== "experiment_exposure" && e.name !== "experiment_conversion") continue;
    const exp = e.metrics?.experiment_id;
    const variant = e.metrics?.variant;
    if (!exp || !variant) continue;
    let variants = byExp.get(exp);
    if (!variants) {
      variants = new Map();
      byExp.set(exp, variants);
    }
    let b = variants.get(variant);
    if (!b) {
      b = { exposures: new Set(), conversions: new Set() };
      variants.set(variant, b);
    }
    if (e.name === "experiment_exposure") b.exposures.add(e.session_id);
    else if (e.name === "experiment_conversion") b.conversions.add(e.session_id);
  }

  const out: ExperimentSummary[] = [];
  for (const [experiment_id, variants] of byExp) {
    const declaredControl = controlByExp.get(experiment_id);
    const rows: VariantSummary[] = [...variants.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([variant, b]) => ({
        variant,
        is_control: declaredControl != null && declaredControl === variant,
        exposures: b.exposures.size,
        conversions: b.conversions.size,
        conversion_rate: b.exposures.size ? b.conversions.size / b.exposures.size : 0,
        lift_vs_control: null,
        p_value_vs_control: null,
        significant_95: false,
      }));
    let control: VariantSummary | undefined;
    if (declaredControl) control = rows.find((r) => r.variant === declaredControl);
    if (!control && rows.length > 0) {
      // Exploratory fallback; DO NOT rely on for decisions.
      control = rows[0];
      control.is_control = true;
    }
    if (control) {
      for (const r of rows) {
        if (r === control) continue;
        r.lift_vs_control = control.conversion_rate
          ? (r.conversion_rate - control.conversion_rate) / control.conversion_rate
          : null;
        r.p_value_vs_control = twoProportionPValue(
          control.conversions,
          control.exposures,
          r.conversions,
          r.exposures,
        );
        r.significant_95 = r.p_value_vs_control !== null && r.p_value_vs_control < 0.05;
      }
    }
    out.push({
      experiment_id,
      variants: rows,
      total_exposures: rows.reduce((s, r) => s + r.exposures, 0),
      total_conversions: rows.reduce((s, r) => s + r.conversions, 0),
      control_variant: control?.variant ?? null,
    });
  }
  return out.sort((a, b) => a.experiment_id.localeCompare(b.experiment_id));
}

/**
 * Two-proportion z-test, two-sided. Returns p in [0,1] or null when either
 * arm has zero exposures / degenerate variance.
 */
export function twoProportionPValue(
  c1: number,
  n1: number,
  c2: number,
  n2: number,
): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!Number.isFinite(se) || se === 0) return null;
  const p1 = c1 / n1;
  const p2 = c2 / n2;
  const z = (p2 - p1) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * Normal CDF via Abramowitz & Stegun 7.1.26 approximation. Accurate to ~7e-8.
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}
