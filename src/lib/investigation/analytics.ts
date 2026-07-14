// Investigation Analytics — aggregates over the bookmark store.
//
// Pure computation; the server function fetches raw bookmark rows and
// hands them here. No PII exposed: only session ids, tags, statuses,
// timestamps, and counts flow through.

export interface BookmarkRow {
  id: string;
  session_id: string;
  status: string;
  priority: string;
  tags: string[];
  reason?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  pinned?: boolean;
  favorite?: boolean;
}

export interface BookmarkAnalytics {
  total: number;
  open: number;
  inReview: number;
  resolved: number;
  falsePositive: number;
  archived: number;
  pinned: number;
  favorites: number;
  falsePositiveRate: number;
  averageResolutionMs: number | null;
  mostBookmarkedSessions: { session_id: string; count: number }[];
  topTags: { tag: string; count: number }[];
  priorityBreakdown: Record<string, number>;
  growth7d: number; // bookmarks created in last 7 days
  growth30d: number;
  trend: { day: string; created: number }[];
}

const DAY = 86_400_000;

export function analyzeBookmarks(rows: BookmarkRow[], now: number = Date.now()): BookmarkAnalytics {
  const counts = {
    total: rows.length,
    open: 0,
    inReview: 0,
    resolved: 0,
    falsePositive: 0,
    archived: 0,
    pinned: 0,
    favorites: 0,
  };
  const sessionTally = new Map<string, number>();
  const tagTally = new Map<string, number>();
  const priorityTally = new Map<string, number>();
  const trendMap = new Map<string, number>();
  let resolutionAccum = 0;
  let resolutionCount = 0;

  for (const r of rows) {
    switch (r.status) {
      case "open":
        counts.open++;
        break;
      case "in_review":
        counts.inReview++;
        break;
      case "resolved":
        counts.resolved++;
        break;
      case "false_positive":
        counts.falsePositive++;
        break;
      case "archived":
        counts.archived++;
        break;
    }
    if (r.pinned) counts.pinned++;
    if (r.favorite) counts.favorites++;
    sessionTally.set(r.session_id, (sessionTally.get(r.session_id) ?? 0) + 1);
    for (const t of r.tags) tagTally.set(t, (tagTally.get(t) ?? 0) + 1);
    priorityTally.set(r.priority, (priorityTally.get(r.priority) ?? 0) + 1);
    const day = r.created_at.slice(0, 10);
    trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
    if (r.status === "resolved" || r.status === "false_positive") {
      const ms = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
      if (Number.isFinite(ms) && ms > 0) {
        resolutionAccum += ms;
        resolutionCount += 1;
      }
    }
  }

  const growth7d = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * DAY).length;
  const growth30d = rows.filter((r) => now - new Date(r.created_at).getTime() <= 30 * DAY).length;

  const totalDecided = counts.resolved + counts.falsePositive;
  const falsePositiveRate = totalDecided > 0 ? counts.falsePositive / totalDecided : 0;

  return {
    ...counts,
    falsePositiveRate,
    averageResolutionMs: resolutionCount > 0 ? Math.round(resolutionAccum / resolutionCount) : null,
    mostBookmarkedSessions: [...sessionTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([session_id, count]) => ({ session_id, count })),
    topTags: [...tagTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count })),
    priorityBreakdown: Object.fromEntries(priorityTally),
    growth7d,
    growth30d,
    trend: [...trendMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, created]) => ({
        day,
        created,
      })),
  };
}
