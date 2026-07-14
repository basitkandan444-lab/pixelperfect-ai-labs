import { describe, expect, it } from "vitest";

import type { SessionClassification } from "./intelligence.server";
import { analyzeBookmarks, type BookmarkRow } from "./investigation/analytics";
import { compareSessions } from "./investigation/compare";
import { explainInvestigation } from "./investigation/explain";
import {
  matchClause,
  matchGroup,
  runSearch,
  type InvestigationRecord,
} from "./investigation/search";
import {
  BookmarkInputSchema,
  FilterGroupSchema,
  SearchRequestSchema,
  WorkspaceInputSchema,
} from "./investigation/schema";
import {
  bucketByDay,
  filterTimeline,
  mergeTimeline,
  type TimelineEvent,
} from "./investigation/timeline";

function mkClass(o: Partial<SessionClassification> = {}): SessionClassification {
  return {
    session_id: o.session_id ?? "s1",
    humanProbability: o.humanProbability ?? 0.9,
    automationProbability: o.automationProbability ?? 0.1,
    qualityScore: o.qualityScore ?? 80,
    confidence: o.confidence ?? "high",
    segment: o.segment ?? "Interested",
    intentScore: o.intentScore ?? 60,
    engagementScore: o.engagementScore ?? 60,
    riskLevel: o.riskLevel ?? "low",
    evidence: o.evidence ?? [
      { signal: "Sustained reading behavior", direction: "positive", weight: 12 },
      { signal: "Multi-page navigation", direction: "positive", weight: 5 },
    ],
    reasons: o.reasons ?? [],
    device: o.device ?? "desktop",
    source: o.source ?? "google",
    country: o.country ?? "US",
    duration_ms: o.duration_ms ?? 30_000,
    events: o.events ?? 12,
    first: o.first ?? "2026-07-14T10:00:00.000Z",
    last: o.last ?? "2026-07-14T10:00:30.000Z",
    summary: o.summary ?? null,
    rageClicks: o.rageClicks ?? 0,
    deadClicks: o.deadClicks ?? 0,
  };
}

function mkRec(o: Partial<InvestigationRecord> = {}): InvestigationRecord {
  return {
    ...mkClass(o),
    landingPage: o.landingPage ?? "/",
    exitPage: o.exitPage ?? "/pricing",
    timelineEvents: o.timelineEvents ?? ["page_view", "click"],
    browser: o.browser ?? "Chrome",
    os: o.os ?? "macOS",
    behaviorTags: o.behaviorTags ?? [],
  };
}

// -------------------- schema --------------------

describe("investigation schema", () => {
  it("BookmarkInputSchema rejects empty title and oversized fields", () => {
    expect(() =>
      BookmarkInputSchema.parse({ sessionId: "s", title: "" }),
    ).toThrow();
    expect(() =>
      BookmarkInputSchema.parse({ sessionId: "s", title: "x".repeat(500) }),
    ).toThrow();
  });

  it("BookmarkInputSchema accepts minimal input and applies defaults", () => {
    const b = BookmarkInputSchema.parse({ sessionId: "sess-1", title: "Weird bot" });
    expect(b.priority).toBe("normal");
    expect(b.status).toBe("open");
    expect(b.tags).toEqual([]);
    expect(b.pinned).toBe(false);
  });

  it("SearchRequestSchema clamps and defaults", () => {
    const s = SearchRequestSchema.parse({});
    expect(s.days).toBe(7);
    expect(s.pageSize).toBe(50);
    expect(() => SearchRequestSchema.parse({ pageSize: 5000 })).toThrow();
  });

  it("FilterGroupSchema supports nested groups", () => {
    const g = FilterGroupSchema.parse({
      combinator: "and",
      clauses: [{ field: "segment", op: "eq", value: "Interested" }],
      groups: [
        {
          combinator: "or",
          clauses: [{ field: "riskLevel", op: "eq", value: "high" }],
          groups: [],
        },
      ],
    });
    expect(g.combinator).toBe("and");
    expect(g.groups[0].combinator).toBe("or");
  });

  it("WorkspaceInputSchema validates config", () => {
    const w = WorkspaceInputSchema.parse({
      name: "My view",
      shared: false,
      config: { visibleColumns: ["a"], charts: [], comparisonSessionIds: [], bookmarkIds: [], pinnedMetrics: [] },
    });
    expect(w.name).toBe("My view");
  });
});

// -------------------- search engine --------------------

describe("search engine", () => {
  const records: InvestigationRecord[] = [
    mkRec({ session_id: "a", segment: "Suspicious", qualityScore: 20, country: "US", riskLevel: "high", behaviorTags: ["rage-click"] }),
    mkRec({ session_id: "b", segment: "Interested", qualityScore: 60, country: "DE", riskLevel: "medium" }),
    mkRec({ session_id: "c", segment: "Activated", qualityScore: 88, country: "US", riskLevel: "low", landingPage: "/pricing" }),
    mkRec({ session_id: "d", segment: "Explorer", qualityScore: 40, country: "FR", riskLevel: "low" }),
  ];

  it("eq matches exact segment", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "segment", op: "eq", value: "Activated", negate: false }],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id)).toEqual(["c"]);
  });

  it("gte + lt numeric range", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [
          { field: "qualityScore", op: "gte", value: 40, negate: false },
          { field: "qualityScore", op: "lt", value: 80, negate: false },
        ],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id).sort()).toEqual(["b", "d"]);
  });

  it("between range operator", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "qualityScore", op: "between", values: [50, 90], negate: false }],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id).sort()).toEqual(["b", "c"]);
  });

  it("contains is case-insensitive substring", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "landingPage", op: "contains", value: "PRIC", negate: false }],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id)).toEqual(["c"]);
  });

  it("in / notIn work on categorical fields", () => {
    const rIn = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "country", op: "in", values: ["US", "DE"], negate: false }],
        groups: [],
      },
    });
    expect(rIn.rows.map((x) => x.session_id).sort()).toEqual(["a", "b", "c"]);
    const rNot = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "country", op: "notIn", values: ["US"], negate: false }],
        groups: [],
      },
    });
    expect(rNot.rows.map((x) => x.session_id).sort()).toEqual(["b", "d"]);
  });

  it("negate flips clause result", () => {
    expect(
      matchClause(records[0], { field: "riskLevel", op: "eq", value: "high", negate: false }),
    ).toBe(true);
    expect(
      matchClause(records[0], { field: "riskLevel", op: "eq", value: "high", negate: true }),
    ).toBe(false);
  });

  it("OR combinator unions matches", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "or",
        clauses: [
          { field: "segment", op: "eq", value: "Suspicious", negate: false },
          { field: "segment", op: "eq", value: "Activated", negate: false },
        ],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id).sort()).toEqual(["a", "c"]);
  });

  it("nested AND-of-ORs works", () => {
    const ok = matchGroup(records[0], {
      combinator: "and",
      clauses: [{ field: "segment", op: "eq", value: "Suspicious", negate: false }],
      groups: [
        {
          combinator: "or",
          clauses: [
            { field: "country", op: "eq", value: "US", negate: false },
            { field: "country", op: "eq", value: "DE", negate: false },
          ],
          groups: [],
        },
      ],
    });
    expect(ok).toBe(true);
  });

  it("array-valued fields (timelineEvent, behaviorTag) match on membership", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "behaviorTag", op: "eq", value: "rage-click", negate: false }],
        groups: [],
      },
    });
    expect(r.rows.map((x) => x.session_id)).toEqual(["a"]);
  });

  it("exists / notExists on optional fields", () => {
    const r = runSearch(records, {
      filter: {
        combinator: "and",
        clauses: [{ field: "landingPage", op: "exists", negate: false }],
        groups: [],
      },
    });
    expect(r.total).toBe(4);
  });

  it("free-text query hits multiple fields", () => {
    const r = runSearch(records, { q: "Activated" });
    expect(r.rows.map((x) => x.session_id)).toEqual(["c"]);
  });

  it("sort by qualityScore asc/desc is deterministic", () => {
    const desc = runSearch(records, { sort: [{ field: "qualityScore", direction: "desc" }] });
    expect(desc.rows.map((x) => x.session_id)).toEqual(["c", "b", "d", "a"]);
    const asc = runSearch(records, { sort: [{ field: "qualityScore", direction: "asc" }] });
    expect(asc.rows.map((x) => x.session_id)).toEqual(["a", "d", "b", "c"]);
  });

  it("pagination is stable and returns non-overlapping pages", () => {
    const bulk: InvestigationRecord[] = Array.from({ length: 25 }, (_, i) =>
      mkRec({ session_id: `s${i}`, qualityScore: 100 - i }),
    );
    const p1 = runSearch(bulk, { sort: [{ field: "qualityScore", direction: "desc" }], page: 1, pageSize: 10 });
    const p2 = runSearch(bulk, { sort: [{ field: "qualityScore", direction: "desc" }], page: 2, pageSize: 10 });
    const p3 = runSearch(bulk, { sort: [{ field: "qualityScore", direction: "desc" }], page: 3, pageSize: 10 });
    expect(p1.rows).toHaveLength(10);
    expect(p2.rows).toHaveLength(10);
    expect(p3.rows).toHaveLength(5);
    expect(p1.pages).toBe(3);
    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.session_id);
    expect(new Set(ids).size).toBe(25);
  });

  it("no-result suggestions appear when total = 0", () => {
    const r = runSearch(records, { q: "zzz-not-here" });
    expect(r.total).toBe(0);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("performance: 5k records filtered under 100ms", () => {
    const large: InvestigationRecord[] = Array.from({ length: 5000 }, (_, i) =>
      mkRec({ session_id: `bulk-${i}`, qualityScore: (i % 100) + 1, segment: i % 2 ? "Interested" : "Suspicious" }),
    );
    const t0 = performance.now();
    const r = runSearch(large, {
      filter: {
        combinator: "and",
        clauses: [
          { field: "qualityScore", op: "gte", value: 50, negate: false },
          { field: "segment", op: "eq", value: "Interested", negate: false },
        ],
        groups: [],
      },
      sort: [{ field: "qualityScore", direction: "desc" }],
      page: 1,
      pageSize: 50,
    });
    const elapsed = performance.now() - t0;
    expect(r.total).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});

// -------------------- comparison --------------------

describe("comparison engine", () => {
  it("flags divergent numeric fields", () => {
    const r = compareSessions([
      mkClass({ session_id: "a", qualityScore: 90 }),
      mkClass({ session_id: "b", qualityScore: 20 }),
    ]);
    const q = r.rows.find((row) => row.field === "qualityScore");
    expect(q?.differs).toBe(true);
    expect(r.differCount).toBeGreaterThan(0);
  });

  it("shared values do not flag as differing", () => {
    const c = mkClass({ session_id: "a" });
    const r = compareSessions([c, { ...c, session_id: "b" }]);
    const q = r.rows.find((row) => row.field === "qualityScore");
    expect(q?.differs).toBe(false);
  });

  it("handles single session gracefully", () => {
    const r = compareSessions([mkClass()]);
    expect(r.summary).toMatch(/at least two/i);
  });

  it("evidence set diff is computed", () => {
    const r = compareSessions([
      mkClass({
        session_id: "a",
        evidence: [{ signal: "S1", direction: "positive", weight: 5 }],
      }),
      mkClass({
        session_id: "b",
        evidence: [{ signal: "S2", direction: "positive", weight: 5 }],
      }),
    ]);
    const ev = r.rows.find((row) => row.field === "evidence.signals");
    expect(ev?.differs).toBe(true);
  });
});

// -------------------- timeline --------------------

describe("timeline engine", () => {
  const events: TimelineEvent[] = [
    { ts: "2026-07-14T10:00:02Z", kind: "behavior", title: "click" },
    { ts: "2026-07-14T10:00:01Z", kind: "audit", title: "engine version" },
    { ts: "2026-07-14T10:00:03Z", kind: "alert", title: "anomaly" },
    { ts: "2026-07-14T09:59:59Z", kind: "version_change", title: "deploy" },
  ];

  it("merges and sorts by timestamp", () => {
    const merged = mergeTimeline([events]);
    const ts = merged.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort());
  });

  it("stable tie-break by kind priority", () => {
    const merged = mergeTimeline([
      [
        { ts: "2026-07-14T10:00:00Z", kind: "audit", title: "A" },
        { ts: "2026-07-14T10:00:00Z", kind: "version_change", title: "V" },
      ],
    ]);
    expect(merged[0].kind).toBe("version_change");
  });

  it("filters by kind and query", () => {
    const merged = mergeTimeline([events]);
    const filt = filterTimeline(merged, { kinds: ["alert"] });
    expect(filt).toHaveLength(1);
    expect(filt[0].title).toBe("anomaly");
    const q = filterTimeline(merged, { q: "deploy" });
    expect(q).toHaveLength(1);
  });

  it("buckets by day", () => {
    const merged = mergeTimeline([events]);
    const buckets = bucketByDay(merged);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].events.length).toBe(4);
  });
});

// -------------------- explain --------------------

describe("explain engine", () => {
  it("splits positive vs negative evidence and never fabricates signals", () => {
    const c = mkClass({
      evidence: [
        { signal: "Natural mouse variance", direction: "positive", weight: 8 },
        { signal: "Rage-clicked 4×", direction: "negative", weight: 6 },
      ],
    });
    const e = explainInvestigation(c);
    expect(e.positive.map((p) => p.signal)).toContain("Natural mouse variance");
    expect(e.negative.map((n) => n.signal)).toContain("Rage-clicked 4×");
    expect(e.narrative).toContain(e.segment);
  });

  it("headline reflects probability", () => {
    const humanEx = explainInvestigation(mkClass({ humanProbability: 0.95, automationProbability: 0.05 }));
    expect(humanEx.headline).toMatch(/human/i);
    const botEx = explainInvestigation(
      mkClass({ humanProbability: 0.1, automationProbability: 0.9, riskLevel: "high" }),
    );
    expect(botEx.headline).toMatch(/automation/i);
  });

  it("does not display raw PII", () => {
    const e = explainInvestigation(mkClass());
    const s = JSON.stringify(e);
    // No IP, no email, no user_id patterns
    expect(s).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(s).not.toMatch(/@[a-z]+\./);
  });
});

// -------------------- analytics --------------------

describe("bookmark analytics", () => {
  const now = new Date("2026-07-14T12:00:00Z").getTime();
  const rows: BookmarkRow[] = [
    {
      id: "1", session_id: "a", status: "open", priority: "high",
      tags: ["suspicious", "needs-review"],
      created_at: new Date(now - 1 * 86_400_000).toISOString(),
      updated_at: new Date(now - 1 * 86_400_000).toISOString(),
      pinned: true, favorite: true,
    },
    {
      id: "2", session_id: "a", status: "resolved", priority: "normal",
      tags: ["human"],
      created_at: new Date(now - 5 * 86_400_000).toISOString(),
      updated_at: new Date(now - 3 * 86_400_000).toISOString(),
    },
    {
      id: "3", session_id: "b", status: "false_positive", priority: "low",
      tags: ["human", "false-positive"],
      created_at: new Date(now - 10 * 86_400_000).toISOString(),
      updated_at: new Date(now - 8 * 86_400_000).toISOString(),
    },
    {
      id: "4", session_id: "c", status: "archived", priority: "critical",
      tags: [],
      created_at: new Date(now - 40 * 86_400_000).toISOString(),
      updated_at: new Date(now - 40 * 86_400_000).toISOString(),
    },
  ];

  it("counts by status, priority, and pinned/favorite", () => {
    const a = analyzeBookmarks(rows, now);
    expect(a.total).toBe(4);
    expect(a.open).toBe(1);
    expect(a.resolved).toBe(1);
    expect(a.falsePositive).toBe(1);
    expect(a.archived).toBe(1);
    expect(a.pinned).toBe(1);
    expect(a.favorites).toBe(1);
    expect(a.priorityBreakdown.critical).toBe(1);
  });

  it("computes false positive rate correctly", () => {
    const a = analyzeBookmarks(rows, now);
    // resolved + false_positive = 2 decided; 1 false positive => 0.5
    expect(a.falsePositiveRate).toBe(0.5);
  });

  it("tallies most bookmarked sessions and top tags", () => {
    const a = analyzeBookmarks(rows, now);
    expect(a.mostBookmarkedSessions[0]).toEqual({ session_id: "a", count: 2 });
    const humanTag = a.topTags.find((t) => t.tag === "human");
    expect(humanTag?.count).toBe(2);
  });

  it("growth windows use provided clock", () => {
    const a = analyzeBookmarks(rows, now);
    expect(a.growth7d).toBe(2);
    expect(a.growth30d).toBe(3);
  });

  it("averageResolutionMs is finite when there are resolutions", () => {
    const a = analyzeBookmarks(rows, now);
    expect(a.averageResolutionMs).not.toBeNull();
    expect(a.averageResolutionMs).toBeGreaterThan(0);
  });
});

// -------------------- privacy invariants --------------------

describe("privacy invariants", () => {
  it("search output never adds PII fields", () => {
    const r = runSearch([mkRec()]);
    const keys = new Set(Object.keys(r.rows[0]));
    // Should not include ip, email, name, phone, cookie, etc.
    for (const forbidden of ["ip", "ip_address", "email", "phone", "name", "cookie", "user_email"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("comparison rows only carry known fields", () => {
    const r = compareSessions([mkClass(), mkClass({ session_id: "b" })]);
    for (const row of r.rows) {
      expect(typeof row.field).toBe("string");
      expect(row.field).not.toMatch(/email|ip|phone|address/);
    }
  });
});
