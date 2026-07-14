import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getTrafficOverview,
  getTrafficSources,
  getGeoBreakdown,
  getDeviceBreakdown,
  getQualityAndFunnel,
  getRealtime,
  getJourneys,
  exportEventsCsv,
} from "@/lib/admin.functions";
import { listGscSites, getGscPerformance } from "@/lib/gsc.functions";
import {
  getIntelligence,
  getVisitorTimelines,
  getSourceIntelligence,
  getRealtimeIntelligence,
  getExecutive,
  getTrends,
  getAlerts,
  getFullReport,
  getValidation,
} from "@/lib/intelligence.functions";

// Admin gate: this route lives under _authenticated so the session is already
// checked. The role check happens client-side (redirect on fail) AND server-side
// in every data function (defense in depth).
export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
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
      { title: "Visitor Intelligence — Command Center" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const [days, setDays] = useState(7);
  const navigate = useNavigate();

  const overviewFn = useServerFn(getTrafficOverview);
  const sourcesFn = useServerFn(getTrafficSources);
  const geoFn = useServerFn(getGeoBreakdown);
  const deviceFn = useServerFn(getDeviceBreakdown);
  const qfFn = useServerFn(getQualityAndFunnel);
  const rtFn = useServerFn(getRealtime);
  const journeysFn = useServerFn(getJourneys);
  const gscSitesFn = useServerFn(listGscSites);
  const gscPerfFn = useServerFn(getGscPerformance);
  const intelFn = useServerFn(getIntelligence);
  const visitorsFn = useServerFn(getVisitorTimelines);
  const sourceIntelFn = useServerFn(getSourceIntelligence);
  const rtIntelFn = useServerFn(getRealtimeIntelligence);
  const execFn = useServerFn(getExecutive);
  const trendsFn = useServerFn(getTrends);
  const alertsFn = useServerFn(getAlerts);
  const fullReportFn = useServerFn(getFullReport);
  const validationFn = useServerFn(getValidation);
  const csvFn = useServerFn(exportEventsCsv);

  // Client-side filters
  const [filters, setFilters] = useState<{
    source: string;
    device: string;
    country: string;
    segment: string;
    quality: string;
  }>({ source: "", device: "", country: "", segment: "", quality: "" });

  const overview = useQuery({
    queryKey: ["ov", days],
    queryFn: () => overviewFn({ data: { days } }),
  });
  const sources = useQuery({
    queryKey: ["src", days],
    queryFn: () => sourcesFn({ data: { days } }),
  });
  const geo = useQuery({ queryKey: ["geo", days], queryFn: () => geoFn({ data: { days } }) });
  const dev = useQuery({ queryKey: ["dev", days], queryFn: () => deviceFn({ data: { days } }) });
  const qf = useQuery({ queryKey: ["qf", days], queryFn: () => qfFn({ data: { days } }) });
  const rt = useQuery({ queryKey: ["rt"], queryFn: () => rtFn(), refetchInterval: 5000 });
  const journeys = useQuery({
    queryKey: ["j", days],
    queryFn: () => journeysFn({ data: { days } }),
  });
  const gscSites = useQuery({ queryKey: ["gscSites"], queryFn: () => gscSitesFn() });
  const firstSite = gscSites.data?.sites?.[0]?.siteUrl;
  const gscPerf = useQuery({
    queryKey: ["gscPerf", firstSite, days],
    queryFn: () =>
      firstSite ? gscPerfFn({ data: { siteUrl: firstSite, days } }) : Promise.resolve(null),
    enabled: !!firstSite,
  });
  const intel = useQuery({
    queryKey: ["intel", days],
    queryFn: () => intelFn({ data: { days } }),
  });
  const visitors = useQuery({
    queryKey: ["visitors", days],
    queryFn: () => visitorsFn({ data: { days, limit: 25 } }),
  });
  const sourceIntel = useQuery({
    queryKey: ["srcIntel", days],
    queryFn: () => sourceIntelFn({ data: { days } }),
  });
  const rtIntel = useQuery({
    queryKey: ["rtIntel"],
    queryFn: () => rtIntelFn({ data: { windowSeconds: 300 } }),
    refetchInterval: 5000,
  });

  const exec = useQuery({
    queryKey: ["exec", days],
    queryFn: () => execFn({ data: { days } }),
  });
  const trends = useQuery({
    queryKey: ["trends", days],
    queryFn: () => trendsFn({ data: { days } }),
  });
  const alerts = useQuery({
    queryKey: ["alerts", days],
    queryFn: () => alertsFn({ data: { days } }),
    refetchInterval: 60_000,
  });

  const validation = useQuery({
    queryKey: ["validation", days],
    queryFn: () => validationFn({ data: { days } }),
  });


  const vitals = useQuery({
    queryKey: ["vitals"],
    queryFn: () => fetch("/api/public/vitals").then((r) => r.json()),
    refetchInterval: 15000,
  });
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () => fetch("/api/public/metrics").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const exportCsv = async () => {
    const { csv } = await csvFn({ data: { days } });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `visitors-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadReport = async (format: "markdown" | "csv" | "html") => {
    const { report } = await fullReportFn({ data: { days, format } });
    const mime =
      format === "csv" ? "text/csv" : format === "html" ? "text/html" : "text/markdown";
    const ext = format === "markdown" ? "md" : format;
    const url = URL.createObjectURL(new Blob([report], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `traffic-intelligence-${days}d.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">Visitor Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Real-time · privacy-preserving · first-party
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
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
            <button
              onClick={exportCsv}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Export CSV
            </button>
            <button
              onClick={() => downloadReport("markdown")}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Report (MD)
            </button>
            <button
              onClick={() => downloadReport("html")}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Report (HTML)
            </button>
            <button
              onClick={() => downloadReport("csv")}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Report (CSV)
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Print
            </button>
            <button
              onClick={signOut}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <Section title="Executive Summary" subtitle="One-glance intelligence briefing">
          <Executive data={exec.data} />
        </Section>

        <Section title="Alerts" subtitle="Privacy-safe anomaly detection">
          <Alerts data={alerts.data} />
        </Section>

        <Section title="Traffic Overview">
          <KPIRow data={overview.data} />
        </Section>

        <Section title="Intelligence Analyst" subtitle="Auto-generated insights, quality score & segments">
          <Intelligence data={intel.data} />
        </Section>

        <Section title="Historical Trends" subtitle="Daily quality, human likelihood, conversions & errors">
          <Trends data={trends.data} />
        </Section>

        <Section title="Real-Time Command Room" subtitle="Live visitors · classified in real time">
          <RealtimeCommandRoom data={rtIntel.data} />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Recent Activity" subtitle="Last 5 minutes">
            <Realtime data={rt.data} />
          </Section>
          <Section title="Product Activation Funnel">
            <Funnel funnel={qf.data?.funnel} />
          </Section>
        </div>

        <Section title="Source Intelligence" subtitle="Quality, conversion & human likelihood by channel">
          <SourceIntel rows={sourceIntel.data} />
        </Section>

        <Section
          title="Visitor Investigation Console"
          subtitle="Filter, inspect and export per-session intelligence"
        >
          <Filters
            data={visitors.data}
            filters={filters}
            setFilters={setFilters}
          />
          <VisitorList rows={visitors.data} filters={filters} />
        </Section>


        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Traffic Sources">
            <TrafficSources rows={sources.data} />
          </Section>
          <Section title="Traffic Quality">
            <Quality q={qf.data?.quality} />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Geography">
            <Geography data={geo.data} />
          </Section>
          <Section title="Device Intelligence">
            <DeviceBreakdown data={dev.data} />
          </Section>
        </div>

        <Section title="Visitor Journeys" subtitle="Top event sequences">
          <Journeys rows={journeys.data} />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Performance (Core Web Vitals)">
            <Vitals data={vitals.data?.data} />
          </Section>
          <Section title="Reliability">
            <Reliability data={metrics.data?.data} />
          </Section>
        </div>

        <Section title="SEO Intelligence" subtitle="Google Search Console">
          <SEO sites={gscSites.data} perf={gscPerf.data} />
        </Section>
      </main>
    </div>
  );
}

function Section({
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

function KPI({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function KPIRow({ data }: { data?: Awaited<ReturnType<typeof getTrafficOverview>> }) {
  if (!data) return <Skeleton />;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      <KPI label="Sessions" value={data.sessions} />
      <KPI label="Pageviews" value={data.pageviews} />
      <KPI label="Events" value={data.events} />
      <KPI label="Enhancements" value={data.enhancements} />
      <KPI label="Downloads" value={data.downloads} />
      <KPI label="Conv. rate" value={pct(data.conversionRate)} sub="download / session" />
      <KPI label="Engagement" value={pct(data.engagementRate)} />
      <KPI label="Avg. session" value={`${Math.round(data.avgSessionMs / 1000)}s`} />
    </div>
  );
}

function Realtime({ data }: { data?: Awaited<ReturnType<typeof getRealtime>> }) {
  if (!data) return <Skeleton />;
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="text-4xl font-bold tabular-nums">{data.active}</div>
        <div className="text-sm text-muted-foreground">active visitors</div>
        <span className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      </div>
      <div className="mt-4">
        <h3 className="text-xs font-medium text-muted-foreground">Top current pages</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {data.topPaths.map(([p, n]) => (
            <li key={p} className="flex justify-between">
              <span className="truncate">{p}</span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Funnel({
  funnel,
}: {
  funnel?: {
    visited: number;
    uploaded: number;
    enhanceStarted: number;
    enhanceCompleted: number;
    downloaded: number;
  };
}) {
  if (!funnel) return <Skeleton />;
  const steps = [
    ["Visited", funnel.visited],
    ["Uploaded", funnel.uploaded],
    ["Enhance started", funnel.enhanceStarted],
    ["Enhance completed", funnel.enhanceCompleted],
    ["Downloaded", funnel.downloaded],
  ] as const;
  const max = Math.max(1, funnel.visited);
  return (
    <ul className="space-y-2">
      {steps.map(([label, n], i) => {
        const pct = (n / max) * 100;
        const prev = i > 0 ? Number(steps[i - 1][1]) : n;
        const dropRate = prev ? 1 - n / prev : 0;
        return (
          <li key={label}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground">
                {n}{" "}
                {i > 0 && dropRate > 0 && (
                  <em className="text-orange-500">-{(dropRate * 100).toFixed(0)}%</em>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TrafficSources({ rows }: { rows?: Awaited<ReturnType<typeof getTrafficSources>> }) {
  if (!rows) return <Skeleton />;
  if (rows.length === 0) return <Empty msg="No traffic yet. Events appear as visitors arrive." />;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="pb-2">Source</th>
          <th>Users</th>
          <th>Enhanced</th>
          <th>Conv.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.source} className="border-t border-border">
            <td className="py-2 capitalize">{r.source}</td>
            <td className="tabular-nums">{r.users}</td>
            <td className="tabular-nums">{r.enhanced}</td>
            <td className="tabular-nums">{(r.conversionRate * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Quality({
  q,
}: {
  q?: { human: number; review: number; suspicious: number; total: number };
}) {
  if (!q) return <Skeleton />;
  if (q.total === 0) return <Empty msg="No sessions yet." />;
  const seg = (n: number, cls: string) => (
    <div className={`h-8 ${cls}`} style={{ width: `${(n / q.total) * 100}%` }} />
  );
  return (
    <div>
      <div className="flex overflow-hidden rounded-md">
        {seg(q.human, "bg-emerald-500")}
        {seg(q.review, "bg-amber-500")}
        {seg(q.suspicious, "bg-red-500")}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <li>
          <span className="text-emerald-500">●</span> Likely human · <b>{q.human}</b>
        </li>
        <li>
          <span className="text-amber-500">●</span> Needs review · <b>{q.review}</b>
        </li>
        <li>
          <span className="text-red-500">●</span> Suspicious · <b>{q.suspicious}</b>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Heuristic score from UA signals, session depth, and meaningful interactions. Not a certainty
        judgment — no user is uniquely identified.
      </p>
    </div>
  );
}

function Geography({ data }: { data?: Awaited<ReturnType<typeof getGeoBreakdown>> }) {
  if (!data) return <Skeleton />;
  if (data.countries.length === 0) return <Empty msg="No geographic data yet." />;
  const max = Math.max(1, ...data.countries.map((c) => c.users));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Top countries</h3>
        <ul className="space-y-1 text-sm">
          {data.countries.slice(0, 10).map((c) => (
            <li key={c.code} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2">
              <span className="font-mono text-xs">{c.code}</span>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${(c.users / max) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">{c.users}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Languages</h3>
        <ul className="space-y-1 text-sm">
          {data.languages.slice(0, 8).map(([l, n]) => (
            <li key={l} className="flex justify-between">
              <span>{l}</span>
              <span className="tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DeviceBreakdown({ data }: { data?: Awaited<ReturnType<typeof getDeviceBreakdown>> }) {
  if (!data) return <Skeleton />;
  const Row = ({ title, rows }: { title: string; rows: { label: string; users: number }[] }) => (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-1 text-sm">
        {rows.slice(0, 6).map((r) => (
          <li key={r.label} className="flex justify-between">
            <span>{r.label}</span>
            <span className="tabular-nums">{r.users}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Row title="Device" rows={data.device_type} />
      <Row title="OS" rows={data.os} />
      <Row title="Browser" rows={data.browser} />
    </div>
  );
}

function Journeys({ rows }: { rows?: Awaited<ReturnType<typeof getJourneys>> }) {
  if (!rows) return <Skeleton />;
  if (rows.length === 0) return <Empty msg="No journeys yet." />;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li
          key={r.signature}
          className="flex items-center justify-between border-b border-border pb-2 last:border-b-0"
        >
          <span className="font-mono text-xs">{r.signature}</span>
          <span className="tabular-nums text-muted-foreground">{r.sessions}</span>
        </li>
      ))}
    </ul>
  );
}

interface VitalMetric {
  p75: number;
  good: number;
  needsImprovement: number;
  poor: number;
}
function Vitals({ data }: { data?: { metrics?: Record<string, VitalMetric> } }) {
  if (!data?.metrics) return <Skeleton />;
  const names = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {names.map((n) => {
        const m = data.metrics?.[n];
        if (!m) return null;
        const rating =
          m.poor > m.good ? "poor" : m.needsImprovement > m.good ? "needs-improvement" : "good";
        const cls =
          rating === "good"
            ? "text-emerald-500"
            : rating === "poor"
              ? "text-red-500"
              : "text-amber-500";
        return (
          <KPI
            key={n}
            label={n}
            value={
              <span className={cls}>
                {n === "CLS" ? m.p75.toFixed(2) : `${Math.round(m.p75)}ms`}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

interface Reliability {
  requests: number;
  success: number;
  failure: number;
  successRate: number;
  p95DurationMs: number;
  errors: Record<string, number>;
}
function Reliability({ data }: { data?: { reliability?: Reliability } }) {
  if (!data?.reliability) return <Skeleton />;
  const r = data.reliability;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3">
        <KPI label="Requests" value={r.requests} />
        <KPI label="Success" value={`${(r.successRate * 100).toFixed(1)}%`} />
        <KPI label="Failures" value={r.failure} />
        <KPI label="p95" value={`${r.p95DurationMs}ms`} />
      </div>
      {Object.keys(r.errors).length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {Object.entries(r.errors).map(([code, n]) => (
            <li key={code} className="flex justify-between">
              <span className="font-mono text-xs">{code}</span>
              <span className="tabular-nums text-red-500">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface GscSites {
  connected: boolean;
  sites: { siteUrl: string }[];
}
interface GscPerf {
  totals: { clicks?: number; impressions?: number; ctr?: number; position?: number } | null;
  byQuery: {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }[];
  byPage: { keys?: string[]; clicks?: number; impressions?: number }[];
}
function SEO({ sites, perf }: { sites?: GscSites; perf?: GscPerf | null }) {
  const connected = sites?.connected;
  const site = sites?.sites?.[0]?.siteUrl;
  if (!connected)
    return (
      <Empty msg="Search Console is linked but no verified property was found. Verify your domain in Search Console." />
    );
  if (!site) return <Empty msg="No verified properties." />;
  if (!perf) return <Skeleton />;
  const t = perf.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return (
    <div>
      <div className="mb-3 text-xs text-muted-foreground">
        Property: <span className="font-mono">{site}</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <KPI label="Clicks" value={t.clicks ?? 0} />
        <KPI label="Impressions" value={t.impressions ?? 0} />
        <KPI label="CTR" value={`${((t.ctr ?? 0) * 100).toFixed(2)}%`} />
        <KPI label="Position" value={(t.position ?? 0).toFixed(1)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Top queries</h3>
          <ul className="space-y-1 text-sm">
            {(perf.byQuery ?? []).slice(0, 10).map((row, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{row.keys?.[0]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.clicks} / {row.impressions}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Top pages</h3>
          <ul className="space-y-1 text-sm">
            {(perf.byPage ?? []).slice(0, 10).map((row, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs">{row.keys?.[0]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.clicks} / {row.impressions}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="h-24 animate-pulse rounded-md bg-muted/50" />;
}
function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground">{msg}</p>;
}

function Intelligence({ data }: { data?: Awaited<ReturnType<typeof getIntelligence>> }) {
  if (!data) return <Skeleton />;
  const o = data.overall;
  if (o.sessions === 0) return <Empty msg="No sessions in this window yet." />;
  const cls =
    o.classification === "high"
      ? "text-emerald-500"
      : o.classification === "low"
        ? "text-red-500"
        : "text-amber-500";
  const label =
    o.classification === "high"
      ? "High confidence human traffic"
      : o.classification === "low"
        ? "Low quality — investigate"
        : "Mixed quality";
  const segEntries = Object.entries(data.segments).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Traffic Quality Score
          </div>
          <div className={`mt-1 text-4xl font-bold tabular-nums ${cls}`}>{o.score}/100</div>
          <div className={`text-sm ${cls}`}>{label}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Human likelihood
          </div>
          <div className="mt-1 text-4xl font-bold tabular-nums text-emerald-500">
            {(o.humanPct * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">
            Automation likelihood {(o.automationPct * 100).toFixed(0)}%
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Quality distribution
          </div>
          <div className="mt-2 flex overflow-hidden rounded-md">
            <div
              className="h-6 bg-emerald-500"
              style={{ width: `${(data.distribution.high / o.sessions) * 100}%` }}
            />
            <div
              className="h-6 bg-amber-500"
              style={{ width: `${(data.distribution.medium / o.sessions) * 100}%` }}
            />
            <div
              className="h-6 bg-red-500"
              style={{ width: `${(data.distribution.low / o.sessions) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>High {data.distribution.high}</span>
            <span>Med {data.distribution.medium}</span>
            <span>Low {data.distribution.low}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">User segments</h3>
          <ul className="space-y-1 text-sm">
            {segEntries.map(([name, n]) => (
              <li key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Top quality signals</h3>
          <ul className="space-y-1 text-sm">
            {data.topReasons.length === 0 && (
              <li className="text-muted-foreground">No signals aggregated yet.</li>
            )}
            {data.topReasons.map((r) => (
              <li key={r.reason} className="flex justify-between">
                <span>{r.reason}</span>
                <span className="tabular-nums text-muted-foreground">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {data.insights.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Automated insights</h3>
          <ul className="space-y-2 text-sm">
            {data.insights.map((line, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-muted/30 px-3 py-2 leading-relaxed"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Retention cohorts (D1/D7/D30):{" "}
        <span className="text-foreground">Not computed.</span> {data.retention.note}
      </p>
    </div>
  );
}


function RealtimeCommandRoom({ data }: { data?: Awaited<ReturnType<typeof getRealtimeIntelligence>> }) {
  if (!data) return <Skeleton />;
  if (data.active === 0) return <Empty msg="No live visitors right now." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Active now" value={data.active} sub={`${data.windowSeconds}s window`} />
        <KPI label="Human likely" value={<span className="text-emerald-500">{data.humanLikely}</span>} />
        <KPI label="Unknown" value={<span className="text-amber-500">{data.unknown}</span>} />
        <KPI label="Suspicious" value={<span className="text-red-500">{data.suspicious}</span>} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Uploading" value={data.currentlyUploading} />
        <KPI label="Enhancing" value={data.currentlyEnhancing} />
        <KPI label="Downloading" value={data.currentlyDownloading} />
        <KPI label="Exploring" value={data.currentlyExploring} />
      </div>
      <div className="grid gap-4 md:grid-cols-3 text-sm">
        <MiniList title="By country" rows={data.byCountry.map((c) => [c.code, c.n] as const)} />
        <MiniList title="By device" rows={data.byDevice.map((c) => [c.device, c.n] as const)} />
        <MiniList title="By source" rows={data.bySource.map((c) => [c.source, c.n] as const)} />
      </div>
    </div>
  );
}

function MiniList({ title, rows }: { title: string; rows: (readonly [string, number])[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-1">
        {rows.length === 0 && <li className="text-muted-foreground">—</li>}
        {rows.map(([k, n]) => (
          <li key={k} className="flex justify-between">
            <span className="truncate">{k}</span>
            <span className="tabular-nums text-muted-foreground">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceIntel({ rows }: { rows?: Awaited<ReturnType<typeof getSourceIntelligence>> }) {
  if (!rows) return <Skeleton />;
  if (rows.length === 0) return <Empty msg="No source data yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="pb-2">Source</th>
            <th>Sessions</th>
            <th>Human</th>
            <th>Automation</th>
            <th>Quality</th>
            <th>Intent</th>
            <th>Activation</th>
            <th>Conv.</th>
            <th>Top segment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-t border-border">
              <td className="py-2 capitalize">{r.source}</td>
              <td className="tabular-nums">{r.sessions}</td>
              <td className="tabular-nums text-emerald-500">{(r.humanPct * 100).toFixed(0)}%</td>
              <td className="tabular-nums text-red-500">{(r.automationPct * 100).toFixed(0)}%</td>
              <td className="tabular-nums">{r.avgQuality}</td>
              <td className="tabular-nums">{r.avgIntent}</td>
              <td className="tabular-nums">{(r.activationRate * 100).toFixed(1)}%</td>
              <td className="tabular-nums">{(r.conversionRate * 100).toFixed(1)}%</td>
              <td className="text-xs text-muted-foreground">
                {r.topSegments.map((s) => `${s.segment} (${s.n})`).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type FilterState = {
  source: string;
  device: string;
  country: string;
  segment: string;
  quality: string;
};

function applyFilters(
  rows: Awaited<ReturnType<typeof getVisitorTimelines>>,
  f: FilterState,
) {
  return rows.filter((v) => {
    const c = v.classification;
    if (f.source && (c.source ?? "unknown") !== f.source) return false;
    if (f.device && (c.device ?? "unknown") !== f.device) return false;
    if (f.country && (c.country ?? "??") !== f.country) return false;
    if (f.segment && c.segment !== f.segment) return false;
    if (f.quality === "high" && c.qualityScore < 70) return false;
    if (f.quality === "medium" && (c.qualityScore < 40 || c.qualityScore >= 70)) return false;
    if (f.quality === "low" && c.qualityScore >= 40) return false;
    if (f.quality === "suspicious" && c.humanProbability > 0.4) return false;
    return true;
  });
}

function Filters({
  data,
  filters,
  setFilters,
}: {
  data?: Awaited<ReturnType<typeof getVisitorTimelines>>;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}) {
  const uniq = (fn: (v: Awaited<ReturnType<typeof getVisitorTimelines>>[number]) => string | null) => {
    const s = new Set<string>();
    (data ?? []).forEach((v) => {
      const val = fn(v);
      if (val) s.add(val);
    });
    return Array.from(s).sort();
  };
  const sources = uniq((v) => v.classification.source);
  const devices = uniq((v) => v.classification.device);
  const countries = uniq((v) => v.classification.country);
  const segments = uniq((v) => v.classification.segment);
  const set = (k: keyof FilterState, val: string) => setFilters({ ...filters, [k]: val });
  const Sel = ({
    k,
    opts,
    label,
  }: {
    k: keyof FilterState;
    opts: string[];
    label: string;
  }) => (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={filters[k]}
        onChange={(e) => set(k, e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="">All</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Sel k="source" opts={sources} label="Source" />
      <Sel k="device" opts={devices} label="Device" />
      <Sel k="country" opts={countries} label="Country" />
      <Sel k="segment" opts={segments} label="Segment" />
      <Sel k="quality" opts={["high", "medium", "low", "suspicious"]} label="Quality" />
      <button
        onClick={() => setFilters({ source: "", device: "", country: "", segment: "", quality: "" })}
        className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
      >
        Reset
      </button>
      <span className="ml-auto text-xs text-muted-foreground">
        Showing {data ? applyFilters(data, filters).length : 0} / {data?.length ?? 0}
      </span>
    </div>
  );
}

function VisitorList({
  rows,
  filters,
}: {
  rows?: Awaited<ReturnType<typeof getVisitorTimelines>>;
  filters?: FilterState;
}) {
  if (!rows) return <Skeleton />;
  const shown = filters ? applyFilters(rows, filters) : rows;
  if (shown.length === 0) return <Empty msg="No visitor sessions match the current filters." />;
  return (
    <ul className="space-y-3">
      {shown.map((v) => (
        <VisitorRow key={v.classification.session_id} v={v} />
      ))}
    </ul>
  );
}

function Executive({ data }: { data?: Awaited<ReturnType<typeof getExecutive>> }) {
  if (!data) return <Skeleton />;
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">{data.headline}</p>
      <ul className="space-y-1 text-sm">
        {data.bullets.map((b, i) => (
          <li key={i} className="rounded-md border border-border bg-muted/30 px-3 py-2">
            {b}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Top source (conv.)"
          value={data.topPerformingSource?.source ?? "—"}
          sub={
            data.topPerformingSource
              ? `${(data.topPerformingSource.conversionRate * 100).toFixed(1)}%`
              : undefined
          }
        />
        <KPI
          label="Top country"
          value={data.topCountry?.code ?? "—"}
          sub={data.topCountry ? `${data.topCountry.sessions} sessions` : undefined}
        />
        <KPI
          label="Top browser"
          value={data.topBrowser?.name ?? "—"}
          sub={data.topBrowser ? `${data.topBrowser.sessions} sessions` : undefined}
        />
        <KPI
          label="Best landing"
          value={<span className="font-mono text-sm">{data.bestPage?.path ?? "—"}</span>}
          sub={data.bestPage ? `${data.bestPage.sessions} sessions` : undefined}
        />
      </div>
      {data.suspiciousPatterns.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Suspicious patterns</h3>
          <ul className="space-y-1 text-sm">
            {data.suspiciousPatterns.map((p, i) => (
              <li key={i} className="text-red-500">
                • {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Alerts({ data }: { data?: Awaited<ReturnType<typeof getAlerts>> }) {
  if (!data) return <Skeleton />;
  if (data.length === 0)
    return <Empty msg="No active alerts. System is within normal operating ranges." />;
  return (
    <ul className="space-y-2 text-sm">
      {data.map((a) => {
        const cls =
          a.severity === "critical"
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : a.severity === "warning"
              ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
              : "border-border bg-muted/30";
        return (
          <li key={a.id} className={`rounded-md border px-3 py-2 ${cls}`}>
            <div className="text-xs uppercase tracking-wide">{a.severity}</div>
            <div className="font-medium">{a.title}</div>
            <div className="text-xs opacity-90">{a.detail}</div>
          </li>
        );
      })}
    </ul>
  );
}

function Trends({ data }: { data?: Awaited<ReturnType<typeof getTrends>> }) {
  if (!data) return <Skeleton />;
  if (data.points.length === 0) return <Empty msg="No trend data yet." />;
  const maxQ = Math.max(1, ...data.points.map((p) => p.quality));
  const maxS = Math.max(1, ...data.points.map((p) => p.sessions));
  const dirCls =
    data.direction === "up"
      ? "text-emerald-500"
      : data.direction === "down"
        ? "text-red-500"
        : "text-muted-foreground";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span>Direction:</span>
        <span className={`font-medium ${dirCls}`}>
          {data.direction} ({data.changePct}%)
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Forecast (next day, trailing mean): {data.forecastQualityNextDay ?? "—"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="pb-1">Date</th>
              <th>Sessions</th>
              <th>Quality</th>
              <th>MA(3)</th>
              <th>Human</th>
              <th>Uploads</th>
              <th>Downloads</th>
              <th>Errors</th>
              <th className="w-40">Quality bar</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((p, i) => (
              <tr key={p.date} className="border-t border-border">
                <td className="py-1 font-mono">{p.date}</td>
                <td className="tabular-nums">{p.sessions}</td>
                <td className="tabular-nums">{p.quality}</td>
                <td className="tabular-nums">{data.movingAverage[i]}</td>
                <td className="tabular-nums">{(p.humanPct * 100).toFixed(0)}%</td>
                <td className="tabular-nums">{p.uploads}</td>
                <td className="tabular-nums">{p.downloads}</td>
                <td className="tabular-nums">{p.errors}</td>
                <td>
                  <div className="flex h-2 gap-[1px]">
                    <div
                      className="bg-primary"
                      style={{ width: `${(p.quality / maxQ) * 60}px`, height: 8 }}
                    />
                    <div
                      className="bg-muted-foreground/50"
                      style={{ width: `${(p.sessions / maxS) * 60}px`, height: 8 }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{data.forecastNote}</p>
    </div>
  );
}


function VisitorRow({ v }: { v: Awaited<ReturnType<typeof getVisitorTimelines>>[number] }) {
  const [open, setOpen] = useState(false);
  const c = v.classification;
  const confCls =
    c.confidence === "high" ? "text-emerald-500" : c.confidence === "low" ? "text-red-500" : "text-amber-500";
  const humanCls =
    c.humanProbability >= 0.7
      ? "text-emerald-500"
      : c.humanProbability <= 0.3
        ? "text-red-500"
        : "text-amber-500";
  const shortId = c.session_id.slice(0, 8);
  const dur = Math.round(c.duration_ms / 1000);
  return (
    <li className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50"
      >
        <span className="font-mono text-xs text-muted-foreground">#{shortId}</span>
        <span className="font-medium">{c.segment}</span>
        <span className={`tabular-nums ${humanCls}`}>
          Human {(c.humanProbability * 100).toFixed(0)}%
        </span>
        <span className={`text-xs ${confCls}`}>({c.confidence} conf.)</span>
        <span className="tabular-nums text-muted-foreground">Q {c.qualityScore}</span>
        <span className="tabular-nums text-muted-foreground">Intent {c.intentScore}</span>
        <span
          className={`text-[10px] uppercase ${c.riskLevel === "high" ? "text-red-500" : c.riskLevel === "medium" ? "text-amber-500" : "text-muted-foreground"}`}
        >
          risk: {c.riskLevel}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {c.device ?? "?"} · {c.country ?? "??"} · {c.source ?? "?"} · {c.events} events · {dur}s
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-border p-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Evidence</h4>
            <ul className="space-y-1 text-xs">
              {c.evidence.map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className={e.direction === "positive" ? "text-emerald-500" : "text-red-500"}>
                    {e.direction === "positive" ? "✓" : "✗"} {e.signal}
                  </span>
                  <span className="tabular-nums text-muted-foreground">±{e.weight}</span>
                </li>
              ))}
              {c.evidence.length === 0 && (
                <li className="text-muted-foreground">No evidence beyond baseline.</li>
              )}
            </ul>
            {(c.rageClicks > 0 || c.deadClicks > 0) && (
              <p className="mt-2 text-xs text-red-500">
                Rage clicks: {c.rageClicks} · Dead clicks: {c.deadClicks}
              </p>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Behavior summary</h4>
            {c.summary ? (
              <SummaryPanel s={c.summary} />
            ) : (
              <p className="text-xs text-muted-foreground">
                No behavior summary captured (visitor didn&apos;t reach page-hide).
              </p>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Timeline</h4>
            <ol className="space-y-1 text-xs">
              {v.timeline.map((t, i) => (
                <li key={i} className="grid grid-cols-[4rem_1fr] gap-2">
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {Math.round(t.offset_ms / 1000)}s
                  </span>
                  <span>
                    <b>{t.name}</b>
                    {t.path && <span className="text-muted-foreground"> · {t.path}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

function SummaryPanel({
  s,
}: {
  s: Record<string, number | string | boolean | null>;
}) {
  const rows: [string, string | number][] = [];
  const add = (label: string, val: string | number | boolean | null | undefined) => {
    if (val === null || val === undefined || val === "") return;
    rows.push([label, typeof val === "boolean" ? (val ? "yes" : "no") : val]);
  };
  add("Reading mode", s.readingMode as string);
  add("Scroll max", s.scrollMaxPct != null ? `${s.scrollMaxPct}%` : null);
  add("Scroll avg", s.scrollAvgPct != null ? `${s.scrollAvgPct}%` : null);
  add("Mouse moves", s.mouseMoves as number);
  add("Mouse speed CV", s.mouseSpeedStd as number);
  add("Clicks", s.clickCount as number);
  add("Click CV", s.clickIntervalCV as number);
  add("Bursts", s.burstClicks as number);
  add("Hover count", s.hoverCount as number);
  add("Hover abandon", s.hoverAbandonRate as number);
  add("Idle ms", s.idleMs as number);
  add("Active ms", s.activeMs as number);
  add("Longest active", s.longestActiveStreakMs as number);
  add("Network", s.effectiveType as string);
  add("RTT", s.rtt as number);
  add("Downlink", s.downlink as number);
  add("Offline transitions", s.offlineTransitions as number);
  add("LCP", s.lcpMs as number);
  add("INP", s.inpMs as number);
  add("CLS", s.cls as number);
  add("Long tasks", s.longTasks as number);
  add("Memory MB", s.memoryUsedMb as number);
  add("Webdriver", s.webdriver as boolean);
  add("Touch", s.hasTouch as boolean);
  add("Languages", s.languages as number);
  add("HW concurrency", s.hardwareConcurrency as number);
  return (
    <ul className="space-y-1 text-xs">
      {rows.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{k}</span>
          <span className="tabular-nums">{v}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-muted-foreground">Empty.</li>}
    </ul>
  );
}
