// Server functions for admin CRUD on the `experiments` table. Every mutation
// requires an authenticated admin session (verified via has_role). Public
// (anon) reads happen client-side via the RLS-scoped supabase client and the
// "Anyone reads running experiments" policy — no server function needed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VariantSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  weight: z.number().positive().finite().max(1_000_000).optional(),
  is_control: z.boolean().optional(),
  label: z.string().max(128).optional(),
});

const ExperimentInputSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  goal_event: z.string().min(1).max(64).default("experiment_conversion"),
  variants: z
    .array(VariantSchema)
    .min(2)
    .max(10)
    .superRefine((vs, ctx) => {
      const controls = vs.filter((v) => v.is_control).length;
      if (controls !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exactly one variant must have is_control=true",
        });
      }
      const ids = new Set<string>();
      for (const v of vs) {
        if (ids.has(v.id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate variant id: ${v.id}` });
        }
        ids.add(v.id);
      }
    }),
});

const StatusInputSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "running", "paused", "archived"]),
});

const DeleteInputSchema = z.object({ id: z.string().uuid() });

export type ExperimentRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: "draft" | "running" | "paused" | "archived";
  variants: Array<{ id: string; weight?: number; is_control?: boolean; label?: string }>;
  goal_event: string;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  archived_at: string | null;
};

// The generated `Database` types don't yet know about the `experiments`
// table, so we widen the middleware-supplied client to an untyped shape for
// this module only. RLS still enforces admin-only mutations at the DB layer.
type UntypedClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
      eq: (
        col: string,
        val: string,
      ) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => {
      select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        col: string,
        val: string,
      ) => {
        select: (cols: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
    delete: () => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
};

async function assertAdmin(context: { supabase: unknown; userId: string }): Promise<void> {
  const client = context.supabase as UntypedClient;
  const { data, error } = await client.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (data !== true) throw new Error("forbidden");
}

export const listExperiments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const client = context.supabase as unknown as UntypedClient;
    const { data, error } = await client
      .from("experiments")
      .select(
        "id, key, name, description, status, variants, goal_event, created_at, updated_at, paused_at, archived_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error("query_failed");
    return { experiments: (data ?? []) as ExperimentRow[] };
  });

export const upsertExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ExperimentInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const client = context.supabase as unknown as UntypedClient;
    const row = {
      key: data.key,
      name: data.name,
      description: data.description,
      goal_event: data.goal_event,
      variants: data.variants,
      created_by: context.userId,
    };
    const { data: out, error } = await client
      .from("experiments")
      .upsert(row, { onConflict: "key" })
      .select("id, key, name, status, variants")
      .single();
    if (error) {
      const msg =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : "insert_failed";
      throw new Error(msg);
    }
    return {
      experiment: out as {
        id: string;
        key: string;
        name: string;
        status: string;
        variants: ExperimentRow["variants"];
      },
    };
  });

export const updateExperimentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => StatusInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const client = context.supabase as unknown as UntypedClient;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "paused") patch.paused_at = now;
    if (data.status === "archived") patch.archived_at = now;
    if (data.status === "running") patch.paused_at = null;
    const { data: out, error } = await client
      .from("experiments")
      .update(patch)
      .eq("id", data.id)
      .select("id, status")
      .single();
    if (error) throw new Error("update_failed");
    return { experiment: out as { id: string; status: string } };
  });

export const deleteExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DeleteInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const client = context.supabase as unknown as UntypedClient;
    const { error } = await client.from("experiments").delete().eq("id", data.id);
    if (error) throw new Error("delete_failed");
    return { ok: true as const };
  });
