import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitCommit,
  Package,
  Rocket,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricsSnapshot } from "@/lib/metrics";
import {
  BUNDLE_BUDGETS,
  STATUS_META,
  formatBytes,
  formatDuration,
  percent,
  relativeTime,
  type ServiceStatus,
} from "@/lib/ops";
import { cn } from "@/lib/utils";
import { ratingFor, VITAL_NAMES, type VitalName, type VitalsSnapshot } from "@/lib/vitals-store";

// Developer Command Center — a single operational view of the running
// deployment: service status, reliability, runtime errors, Web Vitals field
// data and the live release. Reads only the public, PII-free telemetry
// endpoints, polling every few seconds. Not for end users (noindex).

type ReleaseInfo = {
  version: string;
  commit: string;
  release: string;
  buildTime: string;
  mode: string;
};

type MetricsResponse = {
  success: boolean;
  data: {
    deployment: ServiceStatus;
    release: ReleaseInfo;
    reliability: MetricsSnapshot;
    vitals: VitalsSnapshot;
  };
};

type HealthResponse = {
  success?: boolean;
  status: string;
  deployment: ServiceStatus;
  uptimeSeconds: number;
  buildAgeSeconds: number;
  checks: Record<string, boolean>;
};

export const Route = createFileRoute("/ops")({
  head: () => ({
    meta: [
      { title: "Developer Command Center" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Operational telemetry for the running deployment." },
    ],
  }),
  component: OpsDashboard,
});

const POLL_MS = 5000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

function OpsDashboard() {
  const metricsQuery = useQuery({
    queryKey: ["ops", "metrics"],
    queryFn: () => fetchJson<MetricsResponse>("/api/public/metrics"),
    refetchInterval: POLL_MS,
  });
  const healthQuery = useQuery({
    queryKey: ["ops", "health"],
    queryFn: () => fetchJson<HealthResponse>("/api/public/health"),
    refetchInterval: POLL_MS,
  });

  const data = metricsQuery.data?.data;
  const health = healthQuery.data;
  const status: ServiceStatus = data?.deployment ?? health?.deployment ?? "operational";

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Developer Command Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live operational telemetry · refreshes every {POLL_MS / 1000}s
            </p>
          </div>
          <StatusPill status={status} />
        </header>

        {metricsQuery.isError ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Telemetry endpoint unreachable. Retrying…
            </CardContent>
          </Card>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Loading telemetry…</p>
        ) : (
          <div className="space-y-6">
            <ReleaseRow release={data.release} health={health} />
            <ReliabilitySection reliability={data.reliability} />
            <ErrorBreakdown errors={data.reliability.errors} />
            <VitalsSection vitals={data.vitals} />
            <BundleBudgets />
          </div>
        )}
      </div>
    </main>
  );
}

// ---- Status ---------------------------------------------------------------

const TONE_CLASSES = {
  ok: "bg-status-ok text-status-ok-foreground",
  warn: "bg-status-warn text-status-warn-foreground",
  bad: "bg-status-bad text-status-bad-foreground",
} as const;

function StatusPill({ status }: { status: ServiceStatus }) {
  const meta = STATUS_META[status];
  const Icon = status === "operational" ? CheckCircle2 : status === "degraded" ? AlertTriangle : XCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold",
        TONE_CLASSES[meta.tone],
      )}
    >
      <Icon className="h-4 w-4" />
      {meta.label}
    </span>
  );
}

// ---- Release / deployment -------------------------------------------------

function ReleaseRow({ release, health }: { release: ReleaseInfo; health?: HealthResponse }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={<Rocket className="h-4 w-4" />} label="Version" value={release.version} sub={release.mode} />
      <StatCard
        icon={<GitCommit className="h-4 w-4" />}
        label="Commit"
        value={release.commit}
        sub={`built ${relativeTime(release.buildTime)}`}
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="Isolate uptime"
        value={health ? formatDuration(health.uptimeSeconds * 1000) : "—"}
        sub="since cold start"
      />
      <StatCard
        icon={<ShieldCheck className="h-4 w-4" />}
        label="Readiness checks"
        value={health ? `${Object.values(health.checks).filter(Boolean).length}/${Object.keys(health.checks).length}` : "—"}
        sub={health ? Object.entries(health.checks).map(([k, v]) => `${k}: ${v ? "ok" : "fail"}`).join(" · ") : ""}
      />
    </div>
  );
}

// ---- Reliability ----------------------------------------------------------

function ReliabilitySection({ reliability }: { reliability: MetricsSnapshot }) {
  const r = reliability;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Reliability
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            window since {relativeTime(r.since)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="Requests" value={String(r.requests)} />
        <Metric label="Success rate" value={percent(r.successRate)} />
        <Metric label="Successes" value={String(r.success)} />
        <Metric label="Failures" value={String(r.failure)} />
        <Metric label="Avg latency" value={formatDuration(r.avgDurationMs)} />
        <Metric label="p95 latency" value={formatDuration(r.p95DurationMs)} />
        <Metric label="Rate limited" value={String(r.rejectedRateLimit)} />
        <Metric label="Validation rejects" value={String(r.rejectedValidation)} />
        <Metric label="AI timeouts" value={String(r.aiTimeouts)} />
        <Metric label="Client aborts" value={String(r.clientAborted)} />
      </CardContent>
    </Card>
  );
}

// ---- Runtime error aggregation --------------------------------------------

function ErrorBreakdown({ errors }: { errors: Record<string, number> }) {
  const entries = Object.entries(errors).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Runtime errors
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors recorded in this isolate. 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map(([code, count]) => (
              <li key={code} className="flex items-center justify-between py-2 text-sm">
                <code className="font-mono text-foreground">{code}</code>
                <Badge variant="secondary">{count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Web Vitals -----------------------------------------------------------

const VITAL_UNIT: Record<VitalName, string> = {
  LCP: "ms",
  CLS: "",
  INP: "ms",
  FCP: "ms",
  TTFB: "ms",
};

function VitalsSection({ vitals }: { vitals: VitalsSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Web Vitals (field / p75)
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {vitals.samples} samples
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {VITAL_NAMES.map((name) => {
          const m = vitals.metrics[name];
          const rating = m.count > 0 ? ratingFor(name, m.p75) : undefined;
          const tone = rating === "good" ? "ok" : rating === "poor" ? "bad" : "warn";
          return (
            <div key={name} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{name}</span>
                {rating ? (
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full", TONE_CLASSES[tone])}
                    aria-label={rating}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">
                {m.count > 0 ? `${m.p75}${VITAL_UNIT[name]}` : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{m.count} samples</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---- Bundle budgets -------------------------------------------------------

function BundleBudgets() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          Bundle budgets
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            enforced in CI
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Max JS chunk" value={formatBytes(BUNDLE_BUDGETS.maxChunkBytes)} />
        <Metric label="Total JS budget" value={formatBytes(BUNDLE_BUDGETS.maxTotalJsBytes)} />
        <Metric label="Total CSS budget" value={formatBytes(BUNDLE_BUDGETS.maxTotalCssBytes)} />
      </CardContent>
    </Card>
  );
}

// ---- Small presentational helpers -----------------------------------------

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 truncate font-mono text-lg font-bold text-foreground" title={value}>
          {value}
        </p>
        {sub ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
