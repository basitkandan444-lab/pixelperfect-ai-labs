// Investigation Workspace — shared schema.
//
// Pure types + zod schemas. No I/O. Consumed by both server functions and
// client code. Every string field is bounded to keep the audit trail lean
// and prevent abuse via oversized payloads.

import { z } from "zod";

// ---------- Operators & filter engine ----------

export const OPERATORS = [
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
  "notIn",
  "exists",
  "notExists",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const SEARCH_FIELDS = [
  "session_id",
  "segment",
  "humanProbability",
  "automationProbability",
  "confidence",
  "qualityScore",
  "riskLevel",
  "country",
  "browser",
  "os",
  "device",
  "screenClass",
  "source",
  "landingPage",
  "exitPage",
  "timelineEvent",
  "funnelStage",
  "alertStatus",
  "alertSeverity",
  "ruleVersion",
  "engineVersion",
  "auditVersion",
  "dateFrom",
  "dateTo",
  "behaviorTag",
  "rageClicks",
  "deadClicks",
  "hoverActivity",
  "scrollDepth",
  "readingMode",
  "idleMs",
  "connection",
  "performance",
  "classification",
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export const FilterClauseSchema = z.object({
  field: z.enum(SEARCH_FIELDS),
  op: z.enum(OPERATORS),
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
  negate: z.boolean().default(false),
});
export type FilterClause = z.infer<typeof FilterClauseSchema>;

export const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(["and", "or"]).default("and"),
    clauses: z.array(FilterClauseSchema).default([]),
    groups: z.array(FilterGroupSchema).default([]),
  }),
);
export interface FilterGroup {
  combinator: "and" | "or";
  clauses: FilterClause[];
  groups: FilterGroup[];
}

export const SortSchema = z.object({
  field: z.enum(SEARCH_FIELDS),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type Sort = z.infer<typeof SortSchema>;

export const SearchRequestSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  q: z.string().max(200).optional(),
  filter: FilterGroupSchema.optional(),
  sort: z.array(SortSchema).max(5).default([]),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// ---------- Bookmarks ----------

export const BOOKMARK_STATUSES = ["open", "in_review", "resolved", "false_positive", "archived"] as const;
export const BOOKMARK_PRIORITIES = ["low", "normal", "high", "critical"] as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const BookmarkInputSchema = z.object({
  sessionId: trimmed(200),
  title: trimmed(160),
  description: optTrimmed(2000),
  priority: z.enum(BOOKMARK_PRIORITIES).default("normal"),
  status: z.enum(BOOKMARK_STATUSES).default("open"),
  reason: optTrimmed(500),
  risk: optTrimmed(40),
  category: optTrimmed(80),
  folder: optTrimmed(120),
  tags: z.array(trimmed(60)).max(40).default([]),
  linkedAlerts: z.array(trimmed(80)).max(40).default([]),
  linkedIncidents: z.array(trimmed(80)).max(40).default([]),
  pinned: z.boolean().default(false),
  favorite: z.boolean().default(false),
  notes: optTrimmed(4000),
});
export type BookmarkInput = z.infer<typeof BookmarkInputSchema>;

// Import schema — accepts an array of BookmarkInput.
export const BookmarkImportSchema = z.object({
  bookmarks: z.array(BookmarkInputSchema).min(1).max(500),
});

// ---------- Workspaces ----------

export const WorkspaceConfigSchema = z.object({
  search: SearchRequestSchema.partial().optional(),
  visibleColumns: z.array(z.string().max(80)).max(50).default([]),
  charts: z.array(z.string().max(80)).max(20).default([]),
  comparisonSessionIds: z.array(z.string().max(200)).max(10).default([]),
  bookmarkIds: z.array(z.string().uuid()).max(200).default([]),
  pinnedMetrics: z.array(z.string().max(80)).max(20).default([]),
  timeRange: z
    .object({ from: z.string().max(40).optional(), to: z.string().max(40).optional() })
    .optional(),
  savedQuery: z.string().max(200).optional(),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export const WorkspaceInputSchema = z.object({
  name: trimmed(120),
  description: optTrimmed(1000),
  shared: z.boolean().default(false),
  config: WorkspaceConfigSchema,
});
export type WorkspaceInput = z.infer<typeof WorkspaceInputSchema>;

// ---------- Tag catalog (built-ins + user-defined) ----------

export const BUILTIN_TAGS = [
  "human",
  "suspicious",
  "needs-review",
  "false-positive",
  "likely-automation",
  "high-quality",
  "power-user",
  "interesting-journey",
  "ux-issue",
  "performance-issue",
  "regression-candidate",
  "deployment-investigation",
  "traffic-spike",
  "benchmark",
] as const;
export type BuiltinTag = (typeof BUILTIN_TAGS)[number];
