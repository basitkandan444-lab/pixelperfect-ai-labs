/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bookmark,
  BookmarkPlus,
  Clock,
  GitCompare,
  Layers,
  Loader2,
  RefreshCw,
  Search as SearchIcon,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { CommandNav } from "@/components/command-center/CommandNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveBookmark,
  bookmarkAnalytics,
  compareInvestigations,
  createBookmark,
  deleteBookmark,
  explainInvestigation,
  investigationTimeline,
  listBookmarks,
  listWorkspaces,
  saveWorkspace,
  searchInvestigations,
} from "@/lib/investigation.functions";
import {
  OPERATORS,
  SEARCH_FIELDS,
  type Operator,
  type SearchField,
} from "@/lib/investigation/schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/investigations")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: undefined } });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw redirect({ to: "/" });
    return { userId: data.user.id };
  },
  head: () => ({
    meta: [
      { title: "Investigations — Command Center" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Enterprise investigation workspace: search, bookmarks, comparison, timeline.",
      },
    ],
  }),
  component: InvestigationsPage,
});

type Tab = "search" | "bookmarks" | "workspaces" | "compare" | "timeline" | "explain";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "search", label: "Search", icon: <SearchIcon className="h-4 w-4" /> },
  { id: "bookmarks", label: "Bookmarks", icon: <Bookmark className="h-4 w-4" /> },
  { id: "workspaces", label: "Workspaces", icon: <Layers className="h-4 w-4" /> },
  { id: "compare", label: "Compare", icon: <GitCompare className="h-4 w-4" /> },
  { id: "timeline", label: "Timeline", icon: <Clock className="h-4 w-4" /> },
  { id: "explain", label: "Explainability", icon: <Sparkles className="h-4 w-4" /> },
];

function InvestigationsPage() {
  const [tab, setTab] = useState<Tab>("search");
  const [days, setDays] = useState<number>(7);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [drawerSession, setDrawerSession] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= 6 ? prev : [...prev, id],
    );
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Investigation Workspace
            </h1>
            <p className="text-xs text-muted-foreground">
              Search, bookmark, compare, and explain visitor sessions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="range" className="sr-only">
              Time range
            </label>
            <select
              id="range"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              {[1, 7, 14, 28, 90].map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? "Last 24h" : `Last ${d}d`}
                </option>
              ))}
            </select>
            {selectedSessions.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                {selectedSessions.length} selected
                <button
                  aria-label="Clear selection"
                  onClick={() => setSelectedSessions([])}
                  className="ml-1 rounded-sm hover:bg-background/40"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        </div>
      </header>

      <CommandNav />

      <nav
        aria-label="Investigation sections"
        className="border-b border-border bg-card/40"
      >
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {tab === "search" && (
          <SearchPanel
            days={days}
            selected={selectedSessions}
            onToggle={toggleSelect}
            onOpen={setDrawerSession}
          />
        )}
        {tab === "bookmarks" && <BookmarksPanel days={days} onOpen={setDrawerSession} />}
        {tab === "workspaces" && <WorkspacesPanel />}
        {tab === "compare" && (
          <ComparePanel
            days={days}
            sessions={selectedSessions}
            onRemove={(id) =>
              setSelectedSessions((prev) => prev.filter((s) => s !== id))
            }
          />
        )}
        {tab === "timeline" && (
          <TimelinePanel days={days} sessionId={drawerSession} setSessionId={setDrawerSession} />
        )}
        {tab === "explain" && (
          <ExplainPanel days={days} sessionId={drawerSession} setSessionId={setDrawerSession} />
        )}
      </main>

      {drawerSession && (
        <SessionDrawer
          days={days}
          sessionId={drawerSession}
          onClose={() => setDrawerSession(null)}
          onCompare={(id) => {
            if (!selectedSessions.includes(id)) toggleSelect(id);
            setTab("compare");
          }}
        />
      )}
    </div>
  );
}

// ---------- Search ---------------------------------------------------------

function SearchPanel({
  days,
  selected,
  onToggle,
  onOpen,
}: {
  days: number;
  selected: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [field, setField] = useState<SearchField>("segment");
  const [op, setOp] = useState<Operator>("eq");
  const [val, setVal] = useState("");
  const [page, setPage] = useState(1);

  const fn = useServerFn(searchInvestigations);
  const filter = useMemo(() => {
    if (!val.trim()) return undefined;
    return {
      combinator: "and" as const,
      clauses: [{ field, op, value: val, negate: false }],
      groups: [],
    };
  }, [field, op, val]);

  const query = useQuery({
    queryKey: ["inv-search", days, q, filter, page],
    queryFn: () => fn({ data: { days, q: q || undefined, filter, page, pageSize: 50, sort: [] } }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchIcon className="h-4 w-4 text-primary" />
            Filter builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Full-text query…"
              className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Search query"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
            <select
              value={field}
              onChange={(e) => setField(e.target.value as SearchField)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Field"
            >
              {SEARCH_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as Operator)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Operator"
            >
              {OPERATORS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                setPage(1);
              }}
              placeholder="Value"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Value"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setVal("");
                setQ("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Results</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {query.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            {query.data ? `${query.data.total} matches · page ${query.data.page}/${query.data.pages}` : ""}
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <SkeletonRows />
          ) : query.isError ? (
            <ErrorState message="Search failed. Try again." />
          ) : query.data && query.data.rows.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="h-6 w-6" />}
              title="No matches"
              hint={query.data.suggestions.join(" · ") || "Widen your filters."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2"></th>
                    <th className="py-2">Session</th>
                    <th className="py-2">Segment</th>
                    <th className="py-2">Human</th>
                    <th className="py-2">Quality</th>
                    <th className="py-2">Risk</th>
                    <th className="py-2">Source</th>
                    <th className="py-2">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.rows.map((r: any) => {
                    const checked = selected.includes(r.session_id);
                    return (
                      <tr
                        key={r.session_id}
                        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40"
                        onClick={() => onOpen(r.session_id)}
                      >
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => onToggle(r.session_id)}
                            aria-label={`Select ${r.session_id}`}
                          />
                        </td>
                        <td className="py-2 font-mono text-xs">{r.session_id.slice(0, 12)}…</td>
                        <td className="py-2">
                          <Badge variant="secondary">{r.segment}</Badge>
                        </td>
                        <td className="py-2">{Math.round(r.humanProbability * 100)}%</td>
                        <td className="py-2">{r.qualityScore}</td>
                        <td className="py-2">
                          <RiskDot level={r.riskLevel} />
                          <span className="ml-1 text-xs text-muted-foreground">{r.riskLevel}</span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{r.source ?? "—"}</td>
                        <td className="py-2 text-xs text-muted-foreground">{r.device ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {query.data && query.data.pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {query.data.page} of {query.data.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= query.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Bookmarks ------------------------------------------------------

function BookmarksPanel({ days, onOpen }: { days: number; onOpen: (id: string) => void }) {
  const listFn = useServerFn(listBookmarks);
  const analyticsFn = useServerFn(bookmarkAnalytics);
  const archiveFn = useServerFn(archiveBookmark);
  const deleteFn = useServerFn(deleteBookmark);
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ["bookmarks"], queryFn: () => listFn() });
  const analytics = useQuery({
    queryKey: ["bookmarks-analytics", days],
    queryFn: () => analyticsFn({ data: { days } }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  return (
    <div className="space-y-4">
      {analytics.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total" value={String(analytics.data.analytics.total ?? 0)} />
          <StatTile label="Open" value={String(analytics.data.analytics.byStatus?.open ?? 0)} />
          <StatTile
            label="Resolved"
            value={String(analytics.data.analytics.byStatus?.resolved ?? 0)}
          />
          <StatTile
            label="False positive"
            value={String(analytics.data.analytics.byStatus?.false_positive ?? 0)}
          />
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bookmark manager</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <SkeletonRows />
          ) : !list.data || list.data.rows.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="h-6 w-6" />}
              title="No bookmarks yet"
              hint="Bookmark a session from Search or the session drawer."
            />
          ) : (
            <ul className="divide-y divide-border">
              {list.data.rows.map((b: any) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => onOpen(b.session_id)}
                      className="text-left font-medium text-foreground hover:underline"
                    >
                      {b.title}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.session_id} · {b.priority} · {b.status}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant={b.pinned ? "default" : "secondary"}>
                      {b.tags?.length ?? 0} tags
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => archiveMut.mutate(b.id)}
                      disabled={archiveMut.isPending}
                    >
                      Archive
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMut.mutate(b.id)}
                      disabled={deleteMut.isPending}
                      aria-label={`Delete ${b.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Workspaces -----------------------------------------------------

function WorkspacesPanel() {
  const listFn = useServerFn(listWorkspaces);
  const saveFn = useServerFn(saveWorkspace);
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ["workspaces"], queryFn: () => listFn() });
  const [name, setName] = useState("");
  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: name.trim(),
          description: undefined,
          shared: false,
          config: {
            visibleColumns: [],
            charts: [],
            comparisonSessionIds: [],
            bookmarkIds: [],
            pinnedMetrics: [],
          },
        },
      }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Saved workspaces</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length > 0) saveMut.mutate();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            maxLength={120}
            className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Workspace name"
          />
          <Button type="submit" disabled={!name.trim() || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </form>
        {list.isLoading ? (
          <SkeletonRows />
        ) : !list.data || list.data.rows.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No saved workspaces"
            hint="Create one to persist filter, chart, and bookmark selections."
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.rows.map((w: any) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    updated {new Date(w.updated_at).toLocaleString()}
                  </p>
                </div>
                {w.shared && <Badge variant="secondary">Shared</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Compare --------------------------------------------------------

function ComparePanel({
  days,
  sessions,
  onRemove,
}: {
  days: number;
  sessions: string[];
  onRemove: (id: string) => void;
}) {
  const fn = useServerFn(compareInvestigations);
  const enabled = sessions.length >= 2;
  const query = useQuery({
    queryKey: ["compare", days, sessions],
    queryFn: () => fn({ data: { days, sessionIds: sessions } }),
    enabled,
  });

  if (!enabled) {
    return (
      <EmptyState
        icon={<GitCompare className="h-6 w-6" />}
        title="Select at least two sessions to compare"
        hint="Check rows in Search — up to 6 sessions can be compared side-by-side."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-4 w-4 text-primary" />
          Session comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2">
          {sessions.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              <span className="font-mono text-[11px]">{id.slice(0, 10)}…</span>
              <button
                aria-label={`Remove ${id}`}
                onClick={() => onRemove(id)}
                className="rounded-sm hover:bg-background/40"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        {query.isLoading ? (
          <SkeletonRows />
        ) : !query.data ? (
          <ErrorState message="Comparison unavailable." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Field</th>
                  {query.data.report.sessions.map((s: string) => (
                    <th key={s} className="py-2 font-mono">
                      {s.slice(0, 10)}…
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.report.rows.map((r: any) => (
                  <tr
                    key={r.field}
                    className={cn(
                      "border-b border-border/60",
                      r.differs && "bg-status-warn/10",
                    )}
                  >
                    <td className="py-2 font-medium">{r.field}</td>
                    {r.values.map((v: any, i: number) => (
                      <td key={i} className="py-2 text-muted-foreground">
                        {v === null ? "—" : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">{query.data.report.summary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Timeline -------------------------------------------------------

function TimelinePanel({
  days,
  sessionId,
  setSessionId,
}: {
  days: number;
  sessionId: string | null;
  setSessionId: (id: string) => void;
}) {
  const fn = useServerFn(investigationTimeline);
  const query = useQuery({
    queryKey: ["timeline", days, sessionId],
    queryFn: () => fn({ data: { days, sessionId: sessionId! } }),
    enabled: Boolean(sessionId),
  });
  const [input, setInput] = useState(sessionId ?? "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Session timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setSessionId(input.trim());
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Session ID"
            className="min-w-[240px] flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            aria-label="Session ID"
          />
          <Button type="submit">Load</Button>
        </form>
        {!sessionId ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="No session selected"
            hint="Enter a session ID or open one from Search."
          />
        ) : query.isLoading ? (
          <SkeletonRows />
        ) : !query.data || query.data.events.length === 0 ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="No events" hint="Empty stream." />
        ) : (
          <ol className="relative border-l border-border pl-4">
            {query.data.events.map((e: any, i: number) => (
              <li key={i} className="mb-4">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary" />
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.ts).toLocaleString()} · {e.kind}
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Explain --------------------------------------------------------

function ExplainPanel({
  days,
  sessionId,
  setSessionId,
}: {
  days: number;
  sessionId: string | null;
  setSessionId: (id: string) => void;
}) {
  const fn = useServerFn(explainInvestigation);
  const query = useQuery({
    queryKey: ["explain", days, sessionId],
    queryFn: () => fn({ data: { days, sessionId: sessionId! } }),
    enabled: Boolean(sessionId),
  });
  const [input, setInput] = useState(sessionId ?? "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Explainability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setSessionId(input.trim());
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Session ID"
            className="min-w-[240px] flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            aria-label="Session ID"
          />
          <Button type="submit">Load</Button>
        </form>
        {!sessionId ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Select a session to explain"
            hint="Explanations link every claim to a specific evidence signal."
          />
        ) : query.isLoading ? (
          <SkeletonRows />
        ) : !query.data ? (
          <ErrorState message="Session not found in this window." />
        ) : (
          <ExplainReport ex={query.data.explanation} />
        )}
      </CardContent>
    </Card>
  );
}

function ExplainReport({ ex }: { ex: any }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <p className="font-display text-lg font-semibold">{ex.headline}</p>
        <p className="mt-1 text-sm text-muted-foreground">{ex.narrative}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Human" value={`${Math.round(ex.humanProbabilityPct)}%`} />
          <StatTile label="Automation" value={`${Math.round(ex.automationProbabilityPct)}%`} />
          <StatTile label="Quality" value={String(ex.qualityScore)} />
          <StatTile label="Confidence" value={ex.confidence} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <EvidenceList title="Positive" tone="ok" items={ex.positive} />
        <EvidenceList title="Negative" tone="bad" items={ex.negative} />
        <EvidenceList title="Conflicting" tone="warn" items={ex.conflicting} />
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "ok" | "warn" | "bad";
  items: { signal: string; weight: number }[];
}) {
  const dot =
    tone === "ok" ? "bg-status-ok" : tone === "bad" ? "bg-status-bad" : "bg-status-warn";
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-foreground">{it.signal}</span>
              <span className="text-xs text-muted-foreground">+{it.weight.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Session drawer -------------------------------------------------

function SessionDrawer({
  days,
  sessionId,
  onClose,
  onCompare,
}: {
  days: number;
  sessionId: string;
  onClose: () => void;
  onCompare: (id: string) => void;
}) {
  const explainFn = useServerFn(explainInvestigation);
  const bookmarkFn = useServerFn(createBookmark);
  const qc = useQueryClient();
  const explain = useQuery({
    queryKey: ["drawer-explain", days, sessionId],
    queryFn: () => explainFn({ data: { days, sessionId } }),
  });
  const bookmarkMut = useMutation({
    mutationFn: () =>
      bookmarkFn({
        data: {
          sessionId,
          title: `Session ${sessionId.slice(0, 8)}`,
          priority: "normal",
          status: "open",
          tags: [],
          linkedAlerts: [],
          linkedIncidents: [],
          pinned: false,
          favorite: false,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  return (
    <div
      className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Session details"
    >
      <aside
        className="ml-auto flex h-dvh w-full max-w-lg animate-fade-up flex-col border-l border-border bg-card shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-muted-foreground">{sessionId}</p>
            <h2 className="font-display text-lg font-semibold">Session inspector</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1 hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <Button
            size="sm"
            onClick={() => bookmarkMut.mutate()}
            disabled={bookmarkMut.isPending}
          >
            <BookmarkPlus className="mr-1 h-4 w-4" />
            Bookmark
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCompare(sessionId)}>
            <GitCompare className="mr-1 h-4 w-4" />
            Add to compare
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => explain.refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {explain.isLoading ? (
            <SkeletonRows />
          ) : !explain.data ? (
            <ErrorState message="Session not found." />
          ) : (
            <ExplainReport ex={explain.data.explanation} />
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------- Shared UI ------------------------------------------------------

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2" aria-live="polite" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted/50" />
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <Activity className="h-4 w-4" />
      {message}
    </div>
  );
}

function RiskDot({ level }: { level: string }) {
  const tone =
    level === "high" ? "bg-status-bad" : level === "medium" ? "bg-status-warn" : "bg-status-ok";
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone)} aria-hidden />;
}
