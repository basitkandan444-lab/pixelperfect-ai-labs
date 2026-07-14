/* eslint-disable @typescript-eslint/no-explicit-any */
// Investigation Workspace — server functions.
//
// All admin-gated. Bookmarks and workspaces persist to Supabase tables
// under strict RLS; audit events append to `public.events` with names
// `investigation_*` and never carry PII.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  BookmarkImportSchema,
  BookmarkInputSchema,
  SearchRequestSchema,
  WorkspaceInputSchema,
} from "./investigation/schema";

// Concrete serializable row types (Cloudflare Worker RPC can't serialize `unknown`).
export interface BookmarkRowDTO {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  reason: string | null;
  risk: string | null;
  category: string | null;
  folder: string | null;
  tags: string[];
  linked_alerts: string[];
  linked_incidents: string[];
  pinned: boolean;
  favorite: boolean;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export interface WorkspaceRowDTO {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  shared: boolean;
  config: JsonValue;
  created_at: string;
  updated_at: string;
}

const IdSchema = z.object({ id: z.string().uuid() });
const RangeSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });

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

async function audit(sb: unknown, userId: string, name: string, payload: Record<string, unknown>) {
  const client = sb as {
    from: (t: string) => {
      insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  await client.from("events").insert({
    session_id: `admin:${userId.slice(0, 8)}`,
    name: `investigation_${name}`,
    metrics: JSON.parse(JSON.stringify(payload)),
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c?: string) => {
        eq: (
          col: string,
          v: unknown,
        ) => {
          order?: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: unknown; error: unknown }>;
          limit?: (n: number) => Promise<{ data: unknown; error: unknown }>;
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
        order?: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
        limit?: (n: number) => Promise<{ data: unknown; error: unknown }>;
      };
      insert: (v: unknown) => {
        select: (c?: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
      };
      update: (v: unknown) => {
        eq: (
          col: string,
          v: unknown,
        ) => {
          eq: (
            col: string,
            v: unknown,
          ) => {
            select: (c?: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      };
      delete: () => {
        eq: (
          col: string,
          v: unknown,
        ) => {
          eq: (col: string, v: unknown) => Promise<{ error: unknown }>;
        };
      };
    };
  };
}

// ---------- Search ----------

export const searchInvestigations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SearchRequestSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { runSearch } = await import("./investigation/search");

    const events = await fetchWindow(supabaseAdmin, data.days);
    const sessions = groupSessions(events);
    const records = [...sessions.values()].map((s) => {
      const c = classifySession(s);
      return {
        ...c,
        landingPage: s.events[0]?.path ?? null,
        exitPage: s.events[s.events.length - 1]?.path ?? null,
        timelineEvents: [...s.names],
        browser: s.browser,
        os: s.os,
        behaviorTags: [] as string[],
      };
    });
    const result = runSearch(records, {
      q: data.q,
      filter: data.filter,
      sort: data.sort,
      page: data.page,
      pageSize: data.pageSize,
    });

    await audit(supabaseAdmin, context.userId, "search_executed", {
      total: result.total,
      page: data.page,
      pageSize: data.pageSize,
      hasFilter: Boolean(data.filter),
      hasQuery: Boolean(data.q),
    });

    return result;
  });

// ---------- Bookmarks CRUD ----------

const BookmarkRowSelect =
  "id,user_id,session_id,title,description,priority,status,reason,risk,category,folder,tags,linked_alerts,linked_incidents,pinned,favorite,archived_at,notes,created_at,updated_at";

export const listBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const res = await (sb.from("investigation_bookmarks").select(BookmarkRowSelect) as any).order(
      "created_at",
      { ascending: false },
    );
    return { rows: (res.data ?? []) as BookmarkRowDTO[] };
  });

export const createBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookmarkInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const row = {
      user_id: context.userId,
      session_id: data.sessionId,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      status: data.status,
      reason: data.reason ?? null,
      risk: data.risk ?? null,
      category: data.category ?? null,
      folder: data.folder ?? null,
      tags: data.tags,
      linked_alerts: data.linkedAlerts,
      linked_incidents: data.linkedIncidents,
      pinned: data.pinned,
      favorite: data.favorite,
      notes: data.notes ?? null,
    };

    const res = await (sb.from("investigation_bookmarks").insert(row) as any)
      .select(BookmarkRowSelect)
      .single();
    if (res.error) throw new Error("Failed to create bookmark");
    await audit(sb, context.userId, "bookmark_created", {
      sessionId: data.sessionId,
      priority: data.priority,
      status: data.status,
      tagsCount: data.tags.length,
    });
    return { bookmark: res.data };
  });

const BookmarkUpdateSchema = BookmarkInputSchema.partial().extend({ id: z.string().uuid() });

export const updateBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookmarkUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.reason !== undefined) patch.reason = data.reason ?? null;
    if (data.risk !== undefined) patch.risk = data.risk ?? null;
    if (data.category !== undefined) patch.category = data.category ?? null;
    if (data.folder !== undefined) patch.folder = data.folder ?? null;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.linkedAlerts !== undefined) patch.linked_alerts = data.linkedAlerts;
    if (data.linkedIncidents !== undefined) patch.linked_incidents = data.linkedIncidents;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.favorite !== undefined) patch.favorite = data.favorite;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;

    const res = await (sb.from("investigation_bookmarks").update(patch) as any)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(BookmarkRowSelect)
      .single();
    if (res.error) throw new Error("Failed to update bookmark");
    await audit(sb, context.userId, "bookmark_edited", { id: data.id, keys: Object.keys(patch) });
    return { bookmark: res.data };
  });

export const archiveBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    await (
      sb.from("investigation_bookmarks").update({
        status: "archived",
        archived_at: new Date().toISOString(),
      }) as unknown as {
        eq: (
          c: string,
          v: unknown,
        ) => {
          eq: (
            c: string,
            v: unknown,
          ) => { select: (s?: string) => { single: () => Promise<unknown> } };
        };
      }
    )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(BookmarkRowSelect)
      .single();
    await audit(sb, context.userId, "bookmark_archived", { id: data.id });
    return { ok: true };
  });

export const restoreBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    await (
      sb.from("investigation_bookmarks").update({
        status: "open",
        archived_at: null,
      }) as unknown as {
        eq: (
          c: string,
          v: unknown,
        ) => {
          eq: (
            c: string,
            v: unknown,
          ) => { select: (s?: string) => { single: () => Promise<unknown> } };
        };
      }
    )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(BookmarkRowSelect)
      .single();
    await audit(sb, context.userId, "bookmark_restored", { id: data.id });
    return { ok: true };
  });

export const deleteBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    await (sb.from("investigation_bookmarks").delete() as any)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    await audit(sb, context.userId, "bookmark_deleted", { id: data.id });
    return { ok: true };
  });

export const exportBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const res = await (sb.from("investigation_bookmarks").select(BookmarkRowSelect) as any).order(
      "created_at",
      { ascending: false },
    );
    await audit(sb, context.userId, "exported", { count: (res.data ?? []).length });
    return {
      exportedAt: new Date().toISOString(),
      count: (res.data ?? []).length,
      bookmarks: res.data ?? [],
    };
  });

export const importBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BookmarkImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const rows = data.bookmarks.map((b) => ({
      user_id: context.userId,
      session_id: b.sessionId,
      title: b.title,
      description: b.description ?? null,
      priority: b.priority,
      status: b.status,
      reason: b.reason ?? null,
      risk: b.risk ?? null,
      category: b.category ?? null,
      folder: b.folder ?? null,
      tags: b.tags,
      linked_alerts: b.linkedAlerts,
      linked_incidents: b.linkedIncidents,
      pinned: b.pinned,
      favorite: b.favorite,
      notes: b.notes ?? null,
    }));

    const res = await ((sb.from("investigation_bookmarks") as any).insert(rows) as any).select(
      BookmarkRowSelect,
    );
    await audit(sb, context.userId, "imported", { count: rows.length });
    return { imported: rows.length, bookmarks: (res as { data?: BookmarkRowDTO[] }).data ?? [] };
  });

// ---------- Workspaces CRUD ----------

const WorkspaceRowSelect = "id,user_id,name,description,shared,config,created_at,updated_at";
const WorkspaceUpdateSchema = WorkspaceInputSchema.partial().extend({ id: z.string().uuid() });

export const listWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const res = await (sb.from("investigation_workspaces").select(WorkspaceRowSelect) as any).order(
      "updated_at",
      { ascending: false },
    );
    return { rows: (res.data ?? []) as WorkspaceRowDTO[] };
  });

export const saveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const row = {
      user_id: context.userId,
      name: data.name,
      description: data.description ?? null,
      shared: data.shared,
      config: data.config as unknown as Record<string, unknown>,
    };

    const res = await (sb.from("investigation_workspaces").insert(row) as any)
      .select(WorkspaceRowSelect)
      .single();
    await audit(sb, context.userId, "workspace_saved", { name: data.name, shared: data.shared });
    return { workspace: res.data };
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WorkspaceUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.shared !== undefined) patch.shared = data.shared;
    if (data.config !== undefined) patch.config = data.config as unknown as Record<string, unknown>;

    const res = await (sb.from("investigation_workspaces").update(patch) as any)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(WorkspaceRowSelect)
      .single();
    await audit(sb, context.userId, "workspace_restored", { id: data.id });
    return { workspace: res.data };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    await (sb.from("investigation_workspaces").delete() as any)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    await audit(sb, context.userId, "workspace_deleted", { id: data.id });
    return { ok: true };
  });

// ---------- Comparison, Timeline, Explain, Analytics ----------

const CompareSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  sessionIds: z.array(z.string().min(1)).min(2).max(6),
});

export const compareInvestigations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompareSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { compareSessions } = await import("./investigation/compare");
    const events = await fetchWindow(supabaseAdmin, data.days);
    const map = groupSessions(events);
    const classifications = data.sessionIds
      .map((id) => map.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map(classifySession);
    await audit(supabaseAdmin, context.userId, "comparison_created", {
      sessions: data.sessionIds.length,
    });
    return {
      report: compareSessions(classifications),
      missing: data.sessionIds.length - classifications.length,
    };
  });

const TimelineSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  sessionId: z.string().min(1),
});

export const investigationTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TimelineSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { mergeTimeline } = await import("./investigation/timeline");
    const events = await fetchWindow(supabaseAdmin, data.days);
    const s = groupSessions(events).get(data.sessionId);
    if (!s) return { events: [] };
    const c = classifySession(s);
    const behavior = s.events.map((e) => ({
      ts: e.ts,
      kind: "behavior" as const,
      session_id: s.session_id,
      title: e.name,
      detail: e.path ?? undefined,
    }));
    const classification = [
      {
        ts: new Date(s.last).toISOString(),
        kind: "classification" as const,
        session_id: s.session_id,
        title: `Classified as ${c.segment}`,
        detail: `${c.confidence} confidence · ${c.riskLevel} risk`,
      },
    ];
    return { events: mergeTimeline([behavior, classification]) };
  });

export const explainInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TimelineSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWindow, groupSessions, classifySession } = await import("./intelligence.server");
    const { explainInvestigation: explain } = await import("./investigation/explain");
    const events = await fetchWindow(supabaseAdmin, data.days);
    const s = groupSessions(events).get(data.sessionId);
    if (!s) return null;
    return { explanation: explain(classifySession(s)) };
  });

export const bookmarkAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const res = await (
      sb
        .from("investigation_bookmarks")
        .select(
          "id,session_id,status,priority,tags,reason,created_at,updated_at,archived_at,pinned,favorite",
        ) as any
    ).order("created_at", { ascending: false });
    const { analyzeBookmarks } = await import("./investigation/analytics");
    return { analytics: analyzeBookmarks((res.data ?? []) as never) };
  });
