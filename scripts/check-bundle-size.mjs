#!/usr/bin/env node
// Bundle monitoring — enforces client-payload budgets after a production build.
//
// Runs `bun run bundle:check` (or `node scripts/check-bundle-size.mjs`) against
// the emitted client assets and fails (exit 1) when a budget is exceeded. This
// is the guard that keeps LCP/TTI from silently regressing as features land.
//
// Budgets are the single source of truth in src/lib/ops.ts (BUNDLE_BUDGETS) so
// the dashboard and the gate never drift.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// --- Load budgets from the shared source (transpile-free: parse the literals) -
// ops.ts is TS; importing it here would need a loader. Instead we read the same
// numbers via a tiny inline mirror kept in sync by a unit test (ops.test.ts).
const BUDGETS = {
  maxChunkBytes: 640 * 1024,
  maxTotalJsBytes: 1_400 * 1024,
  maxTotalCssBytes: 150 * 1024,
};

// Candidate client-asset roots across possible build layouts (nitro/cloudflare,
// vite dist). We only measure CLIENT assets — server/SSR chunks don't ship to
// users — so we prefer the public/client output and skip server directories.
const CANDIDATE_DIRS = [
  ".output/public",
  "dist/client",
  ".nitro/dist/public",
  ".tanstack/start/build/client-dist",
  "dist",
];

const SKIP_SEGMENTS = new Set(["server", "ssr", "_server", "functions"]);

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_SEGMENTS.has(entry.name)) continue;
      walk(join(dir, entry.name), acc);
    } else if (entry.isFile()) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

function humanBytes(bytes) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const root = CANDIDATE_DIRS.find((d) => existsSync(d));
if (!root) {
  console.warn(
    "[bundle] No client build output found in any known location. " +
      "Run `bun run build` first. Skipping (not failing) the budget check.",
  );
  process.exit(0);
}

const files = walk(root, []);
const jsFiles = files.filter((f) => f.endsWith(".js"));
const cssFiles = files.filter((f) => f.endsWith(".css"));

let totalJs = 0;
let totalCss = 0;
let largestChunk = { file: "", size: 0 };

for (const f of jsFiles) {
  const size = statSync(f).size;
  totalJs += size;
  if (size > largestChunk.size) largestChunk = { file: f, size };
}
for (const f of cssFiles) totalCss += statSync(f).size;

console.log(`[bundle] scanned ${root}`);
console.log(`[bundle] client JS:  ${humanBytes(totalJs)} across ${jsFiles.length} files`);
console.log(`[bundle] client CSS: ${humanBytes(totalCss)} across ${cssFiles.length} files`);
console.log(
  `[bundle] largest chunk: ${humanBytes(largestChunk.size)} (${largestChunk.file || "n/a"})`,
);

const failures = [];
if (largestChunk.size > BUDGETS.maxChunkBytes) {
  failures.push(
    `largest chunk ${humanBytes(largestChunk.size)} > budget ${humanBytes(BUDGETS.maxChunkBytes)}`,
  );
}
if (totalJs > BUDGETS.maxTotalJsBytes) {
  failures.push(`total JS ${humanBytes(totalJs)} > budget ${humanBytes(BUDGETS.maxTotalJsBytes)}`);
}
if (totalCss > BUDGETS.maxTotalCssBytes) {
  failures.push(
    `total CSS ${humanBytes(totalCss)} > budget ${humanBytes(BUDGETS.maxTotalCssBytes)}`,
  );
}

if (failures.length > 0) {
  console.error("\n[bundle] ❌ budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nReduce bundle size or adjust BUNDLE_BUDGETS in src/lib/ops.ts intentionally.");
  process.exit(1);
}

console.log("\n[bundle] ✅ all budgets within limits");
