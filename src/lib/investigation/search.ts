// Investigation Search Engine — pure, deterministic, in-memory.
//
// Runs against an array of enriched session records produced by the
// intelligence engine. Every operator is total: unknown ops and missing
// values return `false` rather than throwing, so a malformed clause never
// crashes the workspace.
//
// Performance: single pass per clause; O(n · clauses). Sorting is stable
// via Array.prototype.sort with a chained comparator. Pagination is applied
// AFTER sorting, so page N+1 always follows page N.

import type { SessionClassification } from "../intelligence.server";

import type { FilterClause, FilterGroup, Operator, SearchField, Sort } from "./schema";

/** Enriched record — flattens summary fields into top-level accessors so
 *  every SearchField resolves without walking nested `summary`. */
export interface InvestigationRecord extends SessionClassification {
  landingPage?: string | null;
  exitPage?: string | null;
  timelineEvents?: string[];
  funnelStage?: string | null;
  alertStatus?: string | null;
  alertSeverity?: string | null;
  ruleVersion?: string | null;
  engineVersion?: string | null;
  auditVersion?: string | null;
  behaviorTags?: string[];
  screenClass?: string | null;
  scrollDepth?: number | null;
  readingMode?: string | null;
  hoverActivity?: number | null;
  idleMs?: number | null;
  connection?: string | null;
  performance?: string | null;
  browser?: string | null;
  os?: string | null;
}

type Primitive = string | number | boolean | null | undefined;

function pluck(rec: InvestigationRecord, field: SearchField): Primitive | Primitive[] | undefined {
  switch (field) {
    case "session_id":
      return rec.session_id;
    case "segment":
      return rec.segment;
    case "humanProbability":
      return rec.humanProbability;
    case "automationProbability":
      return rec.automationProbability;
    case "confidence":
      return rec.confidence;
    case "qualityScore":
      return rec.qualityScore;
    case "riskLevel":
      return rec.riskLevel;
    case "country":
      return rec.country;
    case "device":
      return rec.device;
    case "source":
      return rec.source;
    case "browser":
      return rec.browser ?? (rec.summary?.browser as string | undefined) ?? null;
    case "os":
      return rec.os ?? (rec.summary?.os as string | undefined) ?? null;
    case "screenClass":
      return rec.screenClass ?? null;
    case "landingPage":
      return rec.landingPage ?? null;
    case "exitPage":
      return rec.exitPage ?? null;
    case "timelineEvent":
      return rec.timelineEvents ?? [];
    case "funnelStage":
      return rec.funnelStage ?? null;
    case "alertStatus":
      return rec.alertStatus ?? null;
    case "alertSeverity":
      return rec.alertSeverity ?? null;
    case "ruleVersion":
      return rec.ruleVersion ?? null;
    case "engineVersion":
      return rec.engineVersion ?? null;
    case "auditVersion":
      return rec.auditVersion ?? null;
    case "dateFrom":
    case "dateTo":
      return rec.first;
    case "behaviorTag":
      return rec.behaviorTags ?? [];
    case "rageClicks":
      return rec.rageClicks;
    case "deadClicks":
      return rec.deadClicks;
    case "hoverActivity":
      return rec.hoverActivity ?? null;
    case "scrollDepth":
      return rec.scrollDepth ?? (rec.summary?.scrollMaxPct as number | undefined) ?? null;
    case "readingMode":
      return rec.readingMode ?? (rec.summary?.readingMode as string | undefined) ?? null;
    case "idleMs":
      return rec.idleMs ?? null;
    case "connection":
      return rec.connection ?? null;
    case "performance":
      return rec.performance ?? null;
    case "classification":
      return rec.segment;
    default: {
      // Exhaustiveness guard for future fields — never throws.
      const _n: never = field;
      void _n;
      return undefined;
    }
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Apply a single clause. Returns true when the record matches (before negation). */
export function matchClause(rec: InvestigationRecord, clause: FilterClause): boolean {
  const raw = pluck(rec, clause.field);
  const result = applyOp(raw, clause.op, clause.value, clause.values);
  return clause.negate ? !result : result;
}

function applyOp(
  raw: Primitive | Primitive[] | undefined,
  op: Operator,
  value: unknown,
  values: unknown[] | undefined,
): boolean {
  // Array-valued fields (behaviorTag, timelineEvent) match if ANY member matches.
  if (Array.isArray(raw)) {
    if (op === "exists") return raw.length > 0;
    if (op === "notExists") return raw.length === 0;
    return raw.some((v) => applyOp(v, op, value, values));
  }
  switch (op) {
    case "exists":
      return raw !== null && raw !== undefined && raw !== "";
    case "notExists":
      return raw === null || raw === undefined || raw === "";
    case "eq":
      return raw === value || asString(raw) === asString(value);
    case "neq":
      return !(raw === value || asString(raw) === asString(value));
    case "contains": {
      const s = asString(raw);
      const v = asString(value);
      return s !== null && v !== null && s.toLowerCase().includes(v.toLowerCase());
    }
    case "startsWith": {
      const s = asString(raw);
      const v = asString(value);
      return s !== null && v !== null && s.toLowerCase().startsWith(v.toLowerCase());
    }
    case "endsWith": {
      const s = asString(raw);
      const v = asString(value);
      return s !== null && v !== null && s.toLowerCase().endsWith(v.toLowerCase());
    }
    case "gt": {
      const a = asNumber(raw);
      const b = asNumber(value);
      return a !== null && b !== null && a > b;
    }
    case "gte": {
      const a = asNumber(raw);
      const b = asNumber(value);
      return a !== null && b !== null && a >= b;
    }
    case "lt": {
      const a = asNumber(raw);
      const b = asNumber(value);
      return a !== null && b !== null && a < b;
    }
    case "lte": {
      const a = asNumber(raw);
      const b = asNumber(value);
      return a !== null && b !== null && a <= b;
    }
    case "between": {
      if (!Array.isArray(values) || values.length !== 2) return false;
      const a = asNumber(raw);
      const lo = asNumber(values[0]);
      const hi = asNumber(values[1]);
      if (a === null || lo === null || hi === null) {
        // Fallback: string range (e.g. ISO dates)
        const s = asString(raw);
        const l = asString(values[0]);
        const h = asString(values[1]);
        return s !== null && l !== null && h !== null && s >= l && s <= h;
      }
      return a >= lo && a <= hi;
    }
    case "in":
      return (
        Array.isArray(values) && values.some((v) => raw === v || asString(raw) === asString(v))
      );
    case "notIn":
      return !(
        Array.isArray(values) && values.some((v) => raw === v || asString(raw) === asString(v))
      );
    default: {
      const _n: never = op;
      void _n;
      return false;
    }
  }
}

export function matchGroup(rec: InvestigationRecord, group: FilterGroup): boolean {
  const clauseResults = group.clauses.map((c) => matchClause(rec, c));
  const groupResults = group.groups.map((g) => matchGroup(rec, g));
  const all = [...clauseResults, ...groupResults];
  if (all.length === 0) return true;
  return group.combinator === "or" ? all.some(Boolean) : all.every(Boolean);
}

/** Full-text query — case-insensitive substring across a fixed field set. */
function matchQuery(rec: InvestigationRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystacks: (string | null | undefined)[] = [
    rec.session_id,
    rec.segment,
    rec.confidence,
    rec.riskLevel,
    rec.country,
    rec.device,
    rec.source,
    rec.landingPage,
    rec.exitPage,
    rec.browser,
    rec.os,
    ...(rec.behaviorTags ?? []),
    ...(rec.reasons ?? []),
  ];
  return haystacks.some((h) => typeof h === "string" && h.toLowerCase().includes(needle));
}

function compareBy(a: InvestigationRecord, b: InvestigationRecord, s: Sort): number {
  const av = pluck(a, s.field);
  const bv = pluck(b, s.field);
  const na = Array.isArray(av) ? av.length : asNumber(av);
  const nb = Array.isArray(bv) ? bv.length : asNumber(bv);
  let cmp: number;
  if (na !== null && nb !== null) cmp = na - nb;
  else {
    const sa = asString(Array.isArray(av) ? av.join(",") : av) ?? "";
    const sb = asString(Array.isArray(bv) ? bv.join(",") : bv) ?? "";
    cmp = sa.localeCompare(sb);
  }
  return s.direction === "asc" ? cmp : -cmp;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  rows: InvestigationRecord[];
  suggestions: string[];
}

export interface SearchOptions {
  q?: string;
  filter?: FilterGroup;
  sort?: Sort[];
  page?: number;
  pageSize?: number;
}

export function runSearch(records: InvestigationRecord[], opts: SearchOptions = {}): SearchResult {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 50));

  let filtered = records;
  if (opts.q && opts.q.trim().length > 0) {
    const q = opts.q;
    filtered = filtered.filter((r) => matchQuery(r, q));
  }
  if (opts.filter) {
    const group = opts.filter;
    filtered = filtered.filter((r) => matchGroup(r, group));
  }

  if (opts.sort && opts.sort.length > 0) {
    const sorts = opts.sort;
    filtered = [...filtered].sort((a, b) => {
      for (const s of sorts) {
        const c = compareBy(a, b, s);
        if (c !== 0) return c;
      }
      return 0;
    });
  }

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  // No-result suggestions: propose relaxations when a query narrowed to zero.
  const suggestions: string[] = [];
  if (total === 0) {
    if (opts.q) suggestions.push(`Try a shorter query than "${opts.q}"`);
    if (opts.filter && (opts.filter.clauses.length > 0 || opts.filter.groups.length > 0))
      suggestions.push("Remove one filter clause to broaden the result set");
    suggestions.push("Widen the date range");
  }

  return { total, page, pageSize, pages, rows, suggestions };
}
