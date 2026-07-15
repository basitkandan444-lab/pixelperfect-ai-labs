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

// Admin analytics dashboard — trusted baseline only.
//
// The former "Visitor Intelligence" system (per-session classification,
// human/automation probability, quality score, evidence timelines, segments,
// alerts, audit log, rule sandbox, version intel) was removed because its
// data quality was unreliable. This route now shows only the pre-existing
// first-party analytics (GA4-equivalent counts) and Search Console data.
export const Route = createFileRoute("/_authenticated/admin")({
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
      { title: "Analytics — Command Center" },
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
  const csvFn = useServerFn(exportEventsCsv);

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
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  const exportCsv = async () => {
    const { csv } = await csvFn({ data: { days } });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `events-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">Analytics</h1>
            <p className="text-xs text-muted-foreground">
              First-party events · privacy-preserving
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              aria-label="Time range"
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
              onClick={signOut}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <Section title="Traffic Overview">
          <KPIRow data={overview.data} />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Recent Activity" subtitle="Last 5 minutes">
            <Realtime data={rt.data} />
          </Section>
          <Section title="Product Activation Funnel">
            <Funnel funnel={qf.data?.funnel} />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Traffic Sources">
            <TrafficSources rows={sources.data} />
          </Section>
          <Section title="Traffic Quality" subtitle="Heuristic classification of session engagement">
            <Quality q={qf.data?.quality} />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Geography">
            <Geography data={geo.data} />
          </Section>
          <Section title="Devices">
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

        <Section title="SEO" subtitle="Google Search Console">
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

function Skeleton() {
  return <div className="h-24 animate-pulse rounded-md bg-muted" />;
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
      <KPI
        label="Avg session"
        value={`${Math.round((data.avgSessionMs ?? 0) / 1000)}s`}
      />
    </div>
  );
}

function Realtime({ data }: { data?: Awaited<ReturnType<typeof getRealtime>> }) {
  if (!data) return <Skeleton />;
  return (
    <div className="space-y-2">
      <div className="text-sm">
        <strong className="tabular-nums">{data.active}</strong> active sessions
      </div>
      <ul className="max-h-64 space-y-1 overflow-auto text-xs">
        {data.recent.map((r, i) => (
          <li key={i} className="flex justify-between gap-2 border-b border-border/50 py-1">
            <span className="truncate">{r.name}</span>
            <span className="truncate text-muted-foreground">{r.path ?? "-"}</span>
            <span className="text-muted-foreground">{r.country ?? "??"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Funnel({
  funnel,
}: {
  funnel?: Awaited<ReturnType<typeof getQualityAndFunnel>>["funnel"];
}) {
  if (!funnel) return <Skeleton />;
  const rows: [string, number][] = [
    ["Visited", funnel.visited],
    ["Uploaded", funnel.uploaded],
    ["Enhance started", funnel.enhanceStarted],
    ["Enhance completed", funnel.enhanceCompleted],
    ["Downloaded", funnel.downloaded],
  ];
  const top = rows[0][1] || 1;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map(([label, n]) => (
        <li key={label} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-2">
          <span>{label}</span>
          <div className="h-2 rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${Math.min(100, (n / top) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-right">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function TrafficSources({ rows }: { rows?: Awaited<ReturnType<typeof getTrafficSources>> }) {
  if (!rows) return <Skeleton />;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th>Source</th>
          <th>Users</th>
          <th>Enhanced</th>
          <th>Conv.</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 15).map((r) => (
          <tr key={r.source} className="border-t border-border/50">
            <td className="py-1">{r.source}</td>
            <td className="tabular-nums">{r.users}</td>
            <td className="tabular-nums">{r.enhanced}</td>
            <td className="tabular-nums">{(r.conversionRate * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Quality({ q }: { q?: Awaited<ReturnType<typeof getQualityAndFunnel>>["quality"] }) {
  if (!q) return <Skeleton />;
  const total = q.total || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <KPI label="Engaged" value={q.human} sub={pct(q.human)} />
      <KPI label="Casual" value={q.review} sub={pct(q.review)} />
      <KPI label="Bounce/bot-like" value={q.suspicious} sub={pct(q.suspicious)} />
    </div>
  );
}

function Geography({ data }: { data?: Awaited<ReturnType<typeof getGeoBreakdown>> }) {
  if (!data) return <Skeleton />;
  return (
    <ul className="max-h-64 space-y-1 overflow-auto text-sm">
      {data.countries.slice(0, 20).map((c) => (
        <li key={c.code} className="flex justify-between border-b border-border/50 py-1">
          <span>{c.code}</span>
          <span className="tabular-nums">{c.users}</span>
        </li>
      ))}
    </ul>
  );
}

function DeviceBreakdown({ data }: { data?: Awaited<ReturnType<typeof getDeviceBreakdown>> }) {
  if (!data) return <Skeleton />;
  const Block = ({ title, rows }: { title: string; rows: { label: string; users: number }[] }) => (
    <div>
      <h3 className="mb-1 text-xs uppercase text-muted-foreground">{title}</h3>
      <ul className="space-y-1 text-sm">
        {rows.slice(0, 6).map((r) => (
          <li key={r.label} className="flex justify-between border-b border-border/50 py-1">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums">{r.users}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-4">
      <Block title="Device" rows={data.device_type} />
      <Block title="OS" rows={data.os} />
      <Block title="Browser" rows={data.browser} />
    </div>
  );
}

function Journeys({ rows }: { rows?: Awaited<ReturnType<typeof getJourneys>> }) {
  if (!rows) return <Skeleton />;
  return (
    <ul className="space-y-1 text-sm">
      {rows.slice(0, 15).map((r, i) => (
        <li key={i} className="flex justify-between gap-4 border-b border-border/50 py-1">
          <span className="truncate">{r.signature}</span>
          <span className="tabular-nums text-muted-foreground">{r.sessions}</span>
        </li>
      ))}
    </ul>
  );
}

function Vitals({ data }: { data?: { lcp?: number; cls?: number; inp?: number } | null }) {
  if (!data) return <Skeleton />;
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <KPI label="LCP (p75)" value={`${Math.round(data.lcp ?? 0)}ms`} />
      <KPI label="CLS (p75)" value={(data.cls ?? 0).toFixed(3)} />
      <KPI label="INP (p75)" value={`${Math.round(data.inp ?? 0)}ms`} />
    </div>
  );
}

function Reliability({
  data,
}: {
  data?: {
    reliability?: {
      requests?: number;
      successes?: number;
      failures?: number;
      successRate?: number;
    };
  } | null;
}) {
  if (!data?.reliability) return <Skeleton />;
  const r = data.reliability;
  return (
    <div className="grid grid-cols-4 gap-3 text-sm">
      <KPI label="Requests" value={r.requests ?? 0} />
      <KPI label="Success" value={r.successes ?? 0} />
      <KPI label="Failures" value={r.failures ?? 0} />
      <KPI
        label="Success rate"
        value={`${((r.successRate ?? 0) * 100).toFixed(2)}%`}
      />
    </div>
  );
}

function SEO({
  sites,
  perf,
}: {
  sites?: Awaited<ReturnType<typeof listGscSites>>;
  perf?: Awaited<ReturnType<typeof getGscPerformance>> | null;
}) {
  if (!sites) return <Skeleton />;
  if (!sites.sites?.length)
    return <div className="text-sm text-muted-foreground">No Search Console sites connected.</div>;
  if (!perf) return <Skeleton />;
  const rows = (perf as { rows?: { keys?: string[]; clicks?: number; impressions?: number }[] })
    .rows;
  return (
    <ul className="max-h-64 space-y-1 overflow-auto text-sm">
      {rows?.slice(0, 20).map((r, i) => (
        <li key={i} className="flex justify-between gap-4 border-b border-border/50 py-1">
          <span className="truncate">{r.keys?.[0]}</span>
          <span className="tabular-nums text-muted-foreground">
            {r.clicks} clicks / {r.impressions} impr
          </span>
        </li>
      ))}
    </ul>
  );
}
