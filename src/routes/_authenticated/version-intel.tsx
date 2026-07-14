import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { CommandNav } from "@/components/command-center/CommandNav";
import { supabase } from "@/integrations/supabase/client";
import {
  getOperationalMetrics,
  getRuleImpact,
  getVersionDiff,
  getVersionSnapshots,
  getVersionTimeline,
  listSimulations,
} from "@/lib/version-intel.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/version-intel")({
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
      { title: "Version Intelligence — Command Center" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Version-to-version intelligence comparison, rule impact, promotion recommendations, and engine health.",
      },
    ],
  }),
  component: VersionIntelPage,
});

type Tab =
  | "comparison"
  | "leaderboard"
  | "rules"
  | "timeline"
  | "operations";

const TABS: { id: Tab; label: string }[] = [
  { id: "comparison", label: "Engine Comparison" },
  { id: "leaderboard", label: "Simulation History" },
  { id: "rules", label: "Rule Impact" },
  { id: "timeline", label: "Evolution Timeline" },
  { id: "operations", label: "Operational Metrics" },
];

function pctFmt(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
function numFmt(v: number, digits = 1): string {
  return v.toFixed(digits);
}
function tsFmt(ts: string | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function VersionIntelPage() {
  const [tab, setTab] = useState<Tab>("comparison");
  const [days, setDays] = useState(90);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">Version Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Engine comparison · rule impact · promotion recommendations · zero production mutations
            </p>
          </div>
          <label className="text-xs text-muted-foreground">
            Window
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
              aria-label="Time window in days"
            >
              {[7, 14, 30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  Last {d}d
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <CommandNav />

      <div
        role="tablist"
        aria-label="Version Intelligence sections"
        className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-2"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-10">
        {tab === "comparison" && <EngineComparison days={days} />}
        {tab === "leaderboard" && <SimulationLeaderboard days={days} />}
        {tab === "rules" && <RuleImpact days={days} />}
        {tab === "timeline" && <EvolutionTimeline days={days} />}
        {tab === "operations" && <OperationalMetricsPanel days={days} />}
      </main>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      Failed to load: {error instanceof Error ? error.message : "Unknown error"}
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

// ---------- Engine Comparison ----------

function EngineComparison({ days }: { days: number }) {
  const snapsFn = useServerFn(getVersionSnapshots);
  const diffFn = useServerFn(getVersionDiff);
  const snaps = useQuery({
    queryKey: ["vi-snapshots", days],
    queryFn: () => snapsFn({ data: { days } }),
  });

  const versions = snaps.data?.snapshots ?? [];
  const [baseline, setBaseline] = useState<string>("");
  const [candidate, setCandidate] = useState<string>("");

  const effectiveBaseline = baseline || versions[0]?.engineVersion || "";
  const effectiveCandidate =
    candidate || versions[versions.length - 1]?.engineVersion || "";

  const diff = useQuery({
    queryKey: ["vi-diff", days, effectiveBaseline, effectiveCandidate],
    queryFn: () =>
      diffFn({
        data: { days, baseline: effectiveBaseline, candidate: effectiveCandidate },
      }),
    enabled:
      !!effectiveBaseline &&
      !!effectiveCandidate &&
      effectiveBaseline !== effectiveCandidate,
  });

  return (
    <div className="space-y-6">
      <Card
        title="Version snapshots"
        subtitle="Every engine version aggregated from the immutable simulation stream"
      >
        {snaps.isLoading ? (
          <Skeleton rows={4} />
        ) : snaps.error ? (
          <ErrorBox error={snaps.error} />
        ) : !versions.length ? (
          <Empty message="No sandbox simulations recorded in the selected window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Engine</th>
                  <th>Sims</th>
                  <th>Human %</th>
                  <th>Automation %</th>
                  <th>Avg quality</th>
                  <th>P95 quality</th>
                  <th>Avg conf</th>
                  <th>Risk high %</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.engineVersion} className="border-b border-border/60">
                    <td className="py-2 font-medium">{v.engineVersion}</td>
                    <td>{v.simulations}</td>
                    <td className="tabular-nums">{pctFmt(v.humanPct)}</td>
                    <td className="tabular-nums">{pctFmt(v.automationPct)}</td>
                    <td className="tabular-nums">{numFmt(v.avgQuality)}</td>
                    <td className="tabular-nums">{numFmt(v.p95Quality)}</td>
                    <td className="tabular-nums">{numFmt(v.avgConfidence, 2)}</td>
                    <td className="tabular-nums">{pctFmt(v.highRiskPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Version-to-version diff" subtitle="Deterministic comparison with plain-language explanations">
        {versions.length < 2 ? (
          <Empty message="Need at least two distinct engine versions with simulations." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              <label className="text-xs text-muted-foreground">
                Baseline
                <select
                  value={effectiveBaseline}
                  onChange={(e) => setBaseline(e.target.value)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.engineVersion} value={v.engineVersion}>
                      {v.engineVersion}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Candidate
                <select
                  value={effectiveCandidate}
                  onChange={(e) => setCandidate(e.target.value)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.engineVersion} value={v.engineVersion}>
                      {v.engineVersion}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {diff.isLoading ? (
              <Skeleton rows={5} />
            ) : diff.error ? (
              <ErrorBox error={diff.error} />
            ) : !diff.data?.diff ? (
              <Empty message="Select two versions with simulations to compare." />
            ) : (
              <div className="space-y-3">
                <p className="text-sm">{diff.data.diff.summary}</p>
                <ul className="grid gap-2 md:grid-cols-2">
                  {diff.data.diff.metrics.map((m) => (
                    <li
                      key={m.key}
                      className={cn(
                        "rounded-md border p-3 text-sm",
                        m.polarity === "positive"
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : m.polarity === "negative"
                            ? "border-rose-500/40 bg-rose-500/5"
                            : "border-border",
                      )}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium">{m.label}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">
                          {m.isPct
                            ? `${pctFmt(m.before)} → ${pctFmt(m.after)}`
                            : `${numFmt(m.before)} → ${numFmt(m.after)}`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Leaderboard ----------

function SimulationLeaderboard({ days }: { days: number }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [engineVersion, setEngineVersion] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"ts" | "quality" | "human" | "confidence" | "duration">("ts");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const listFn = useServerFn(listSimulations);
  const list = useQuery({
    queryKey: ["vi-list", days, page, q, engineVersion, status, sort, order],
    queryFn: () =>
      listFn({
        data: { days, page, pageSize: 25, q, engineVersion, status, sort, order },
      }),
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <Card
      title="Simulation history"
      subtitle="Every sandbox simulation. Filter, sort, paginate. Append-only audit."
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search simulation, engine, rule version"
          aria-label="Search"
          className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        <input
          value={engineVersion}
          onChange={(e) => {
            setEngineVersion(e.target.value);
            setPage(1);
          }}
          placeholder="Engine version"
          aria-label="Filter by engine version"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          <option value="safe-to-deploy">safe-to-deploy</option>
          <option value="deploy-with-caution">deploy-with-caution</option>
          <option value="reject">reject</option>
          <option value="requires-more-evidence">requires-more-evidence</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort field"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="ts">Date</option>
          <option value="quality">Quality</option>
          <option value="human">Human %</option>
          <option value="confidence">Confidence</option>
          <option value="duration">Duration</option>
        </select>
        <select
          value={order}
          onChange={(e) => setOrder(e.target.value as typeof order)}
          aria-label="Sort direction"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {list.isLoading ? (
        <Skeleton rows={6} />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : !rows.length ? (
        <Empty message="No simulations match the current filters." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Simulation</th>
                  <th>Date</th>
                  <th>Engine</th>
                  <th>Dataset</th>
                  <th>Human %</th>
                  <th>Bot %</th>
                  <th>Avg conf</th>
                  <th>Avg quality</th>
                  <th>Winner</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.simulationId} className="border-b border-border/60">
                    <td className="py-2 font-mono text-xs">{r.simulationId}</td>
                    <td className="text-xs">{tsFmt(r.ts)}</td>
                    <td>{r.engineVersion}</td>
                    <td className="tabular-nums">{r.sampleSize}</td>
                    <td className="tabular-nums">{pctFmt(r.humanPct)}</td>
                    <td className="tabular-nums">{pctFmt(r.botPct)}</td>
                    <td className="tabular-nums">{numFmt(r.avgConfidence, 2)}</td>
                    <td className="tabular-nums">{numFmt(r.avgQuality)}</td>
                    <td className="text-xs uppercase">{r.winner}</td>
                    <td className="text-xs">{r.status}</td>
                    <td className="tabular-nums text-xs">{r.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total} total · page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-input px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-input px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------- Rule Impact ----------

function RuleImpact({ days }: { days: number }) {
  const fn = useServerFn(getRuleImpact);
  const q = useQuery({
    queryKey: ["vi-rule-impact", days],
    queryFn: () => fn({ data: { days } }),
  });
  const rows = q.data?.rows ?? [];

  return (
    <Card
      title="Rule impact analysis"
      subtitle="Per-rule weight movement and downstream population effect"
    >
      {q.isLoading ? (
        <Skeleton rows={6} />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !rows.length ? (
        <Empty message="No simulations yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Rule</th>
                <th>Current</th>
                <th>Previous</th>
                <th>Δ</th>
                <th>Sessions affected</th>
                <th>Avg score Δ</th>
                <th>Avg conf Δ</th>
                <th>Quality Δ</th>
                <th>Risk Δ</th>
                <th>Top +</th>
                <th>Top −</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ruleKey} className="border-b border-border/60">
                  <td className="py-2">{r.ruleName}</td>
                  <td className="tabular-nums">{numFmt(r.currentWeight, 2)}</td>
                  <td className="tabular-nums">{numFmt(r.previousWeight, 2)}</td>
                  <td
                    className={cn(
                      "tabular-nums",
                      r.delta > 0 ? "text-emerald-500" : r.delta < 0 ? "text-rose-500" : "",
                    )}
                  >
                    {numFmt(r.delta, 2)}
                  </td>
                  <td className="tabular-nums">{r.sessionsAffected}</td>
                  <td className="tabular-nums">{numFmt(r.avgScoreChange, 2)}</td>
                  <td className="tabular-nums">{numFmt(r.avgConfidenceChange, 2)}</td>
                  <td className="tabular-nums">{numFmt(r.qualityChange, 2)}</td>
                  <td className="tabular-nums">{numFmt(r.riskChange, 2)}</td>
                  <td className="tabular-nums text-emerald-500">
                    {numFmt(r.topPositive, 2)}
                  </td>
                  <td className="tabular-nums text-rose-500">
                    {numFmt(r.topNegative, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Timeline ----------

function EvolutionTimeline({ days }: { days: number }) {
  const fn = useServerFn(getVersionTimeline);
  const q = useQuery({
    queryKey: ["vi-timeline", days],
    queryFn: () => fn({ data: { days } }),
  });
  const timeline = q.data?.timeline ?? [];

  return (
    <Card
      title="Intelligence evolution timeline"
      subtitle="Chronological engine + rule history with milestones and regressions"
    >
      {q.isLoading ? (
        <Skeleton rows={6} />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !timeline.length ? (
        <Empty message="Timeline is empty." />
      ) : (
        <ol className="space-y-2">
          {timeline.map((t) => (
            <li
              key={t.simulationId}
              className={cn(
                "rounded-md border p-3 text-sm",
                t.regression
                  ? "border-rose-500/40 bg-rose-500/5"
                  : t.milestone
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">Engine {t.engineVersion}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    rules {t.ruleVersion} · hash {t.modelConfigHash}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{tsFmt(t.ts)}</div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.note}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                <span>verdict: {t.verdict}</span>
                <span>promotion: {t.promotion}</span>
                <span>human Δ: {pctFmt(t.humanShift)}</span>
                <span>quality Δ: {numFmt(t.qualityShift)}</span>
                <span>rule changes: {t.ruleChanges}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------- Operational Metrics ----------

function OperationalMetricsPanel({ days }: { days: number }) {
  const fn = useServerFn(getOperationalMetrics);
  const q = useQuery({
    queryKey: ["vi-ops", days],
    queryFn: () => fn({ data: { days } }),
  });

  const m = q.data?.metrics;
  const kpis = useMemo(() => {
    if (!m) return [];
    return [
      { label: "Simulations", value: m.totalSimulations.toString() },
      { label: "Avg confidence", value: numFmt(m.avgConfidence, 2) },
      { label: "Avg evidence", value: numFmt(m.avgEvidenceCount, 1) },
      { label: "Avg quality", value: numFmt(m.avgQuality, 1) },
      { label: "Avg bot prob", value: pctFmt(m.avgBotProbability) },
      { label: "Success rate", value: pctFmt(m.simulationSuccessRate) },
      { label: "Promotion rate", value: pctFmt(m.promotionRate) },
      { label: "Regression rate", value: pctFmt(m.regressionRate) },
    ];
  }, [m]);

  return (
    <div className="space-y-6">
      <Card title="Engine health" subtitle="Real-time operational metrics">
        {q.isLoading ? (
          <Skeleton rows={4} />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : !m || !m.totalSimulations ? (
          <Empty message="No simulations recorded yet." />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {m && m.totalSimulations > 0 && (
        <>
          <Card title="Version adoption">
            <ul className="space-y-1 text-sm">
              {m.versionAdoption.map((v) => (
                <li key={v.engineVersion} className="flex items-center justify-between">
                  <span className="font-mono">{v.engineVersion}</span>
                  <span className="tabular-nums text-muted-foreground">{pctFmt(v.share)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Risk distribution">
            <ul className="space-y-1 text-sm">
              {Object.entries(m.riskDistribution).map(([tier, n]) => (
                <li key={tier} className="flex items-center justify-between">
                  <span className="capitalize">{tier}</span>
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Confidence trend" subtitle="Per-simulation avg confidence rank (1-3)">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {m.confidenceTrend.slice(-20).map((p, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{tsFmt(p.ts)}</span>
                  <span className="tabular-nums">{numFmt(p.value, 2)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
