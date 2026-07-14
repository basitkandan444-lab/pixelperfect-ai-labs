// Loop 2 — Sandbox server functions. Admin-gated. Reads production events
// read-only, runs the simulation entirely in memory, and appends an
// immutable audit event `sandbox_simulation`. Production scoring is never
// modified.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RuleSetSchema = z.object({
  weights: z.object({
    rageClick: z.number().finite(),
    deadClick: z.number().finite(),
    scroll: z.number().finite(),
    hover: z.number().finite(),
    idle: z.number().finite(),
    mouseRhythm: z.number().finite(),
    clickRhythm: z.number().finite(),
    reading: z.number().finite(),
    network: z.number().finite(),
    performance: z.number().finite(),
  }),
  thresholds: z.object({
    evidenceHigh: z.number().finite(),
    evidenceMedium: z.number().finite(),
    humanHigh: z.number().finite(),
    humanLow: z.number().finite(),
    automationHigh: z.number().finite(),
    automationMedium: z.number().finite(),
    riskEvidenceMin: z.number().finite(),
  }),
});

const SimulateSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  rules: RuleSetSchema,
  limit: z.number().int().min(10).max(5000).default(1000),
});

async function assertAdmin(supabase: unknown, userId: string) {
  const s = supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data, error } = await s.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getDefaultRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { DEFAULT_RULES, WEIGHT_META, THRESHOLD_META } = await import("./sandbox/rules");
    return { rules: DEFAULT_RULES, weightMeta: WEIGHT_META, thresholdMeta: THRESHOLD_META };
  });

export const validateRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RuleSetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { validateRuleSet, diffRuleSets, DEFAULT_RULES } = await import("./sandbox/rules");
    return { validation: validateRuleSet(data), diff: diffRuleSets(DEFAULT_RULES, data) };
  });

export const simulateRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SimulateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { validateRuleSet } = await import("./sandbox/rules");
    const validation = validateRuleSet(data.rules);
    if (!validation.ok) {
      return { ok: false as const, validation };
    }

    const sb = await admin();
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { simulate } = await import("./sandbox/simulate");
    const { currentEngineVersion, MODEL_CONFIG_HASH, RULE_VERSION } = await import("./audit");

    // Read-only fetch of production events; classify in memory.
    const events = await fetchWindow(sb, data.days);
    const sessions = groupSessions(events);
    const production = [...sessions.values()].slice(0, data.limit).map(classifySession);

    const started = Date.now();
    const result = simulate({
      productionClassifications: production,
      proposedRules: data.rules,
      clock: () => Date.now(),
    });

    // Append an immutable audit event. Never modifies production scoring.
    const engine = currentEngineVersion();
    const auditEntry = {
      simulationId: result.simulationId,
      ranAt: result.ranAt,
      ruleVersion: RULE_VERSION,
      engineVersion: engine.engineVersion,
      modelConfigHash: MODEL_CONFIG_HASH,
      user: context.userId,
      sampleSize: result.sampleSize,
      durationMs: result.durationMs,
      recommendation: result.recommendation.verdict,
      before: result.before,
      after: result.after,
      impact: result.impact,
      proposedRules: data.rules,
    };
    await sb.from("events").insert({
      session_id: `ops:sandbox`,
      name: "sandbox_simulation",
      metrics: JSON.parse(JSON.stringify(auditEntry)),
    });

    // Trim comparisons for transport (keep first 200 for UI drill-down).
    const trimmed = {
      ...result,
      comparisons: result.comparisons.slice(0, 200),
    };
    return { ok: true as const, validation, result: trimmed, startedAt: started };
  });

const HistorySchema = z.object({ days: z.number().int().min(1).max(90).default(30) });

export const getSandboxHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => HistorySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await sb
      .from("events")
      .select("metrics,ts")
      .eq("name", "sandbox_simulation")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(200);
    const entries = (rows ?? []).map((r) => ({
      ts: r.ts,
      ...(r.metrics as Record<string, unknown>),
    }));
    return { entries };
  });
