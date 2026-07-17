// Server-only GSC fetchers. Isolates `process.env` reads from the
// createServerFn wrapper file (which is part of the client module graph;
// see tanstack-serverfn-splitting).

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

function headers() {
  return {
    Authorization: `Bearer ${process.env.LOVABLE_API_KEY!}`,
    "X-Connection-Api-Key": process.env.GOOGLE_SEARCH_CONSOLE_API_KEY!,
    "Content-Type": "application/json",
  };
}

export function isGscConfigured(): boolean {
  return !!process.env.GOOGLE_SEARCH_CONSOLE_API_KEY && !!process.env.LOVABLE_API_KEY;
}

export type GscSite = { siteUrl: string; permissionLevel?: string };
export type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};
export type GscTotals = { clicks?: number; impressions?: number; ctr?: number; position?: number };

export async function fetchGscSites(): Promise<{
  sites: GscSite[];
  connected: boolean;
  error?: string;
}> {
  if (!isGscConfigured()) return { sites: [], connected: false };
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
  if (!res.ok) return { sites: [], connected: false, error: `${res.status}` };
  const j = (await res.json()) as { siteEntry?: GscSite[] };
  return { sites: j.siteEntry ?? [], connected: true };
}

export async function fetchGscPerformance(
  siteUrl: string,
  days: number,
): Promise<{ totals: GscTotals | null; byQuery: GscRow[]; byPage: GscRow[] } | null> {
  if (!isGscConfigured()) return null;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const path = `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const call = async (dim: string[]): Promise<{ rows: GscRow[] }> => {
    const res = await fetch(`${GATEWAY}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        startDate: iso(start),
        endDate: iso(end),
        dimensions: dim,
        rowLimit: 50,
      }),
    });
    if (!res.ok) return { rows: [] };
    const j = (await res.json()) as { rows?: GscRow[] };
    return { rows: j.rows ?? [] };
  };
  const [totals, byQuery, byPage] = await Promise.all([call([]), call(["query"]), call(["page"])]);
  return {
    totals: (totals.rows[0] as GscTotals | undefined) ?? null,
    byQuery: byQuery.rows,
    byPage: byPage.rows,
  };
}
