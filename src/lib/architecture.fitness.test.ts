// Architecture fitness functions.
//
// These are executable invariants that must ALWAYS remain true, turning the
// prose rules in docs/ARCHITECTURE.md into automated guardrails. They scan the
// source tree and fail the build the moment the architecture drifts — so a
// dependency-direction inversion, a leaked secret, a framework leak into core
// logic, or a hand-edited generated file can never silently ship.
//
// This suite runs in the standard `vitest` gate (part of `bun run check` and
// CI), so it needs no separate job and cannot be skipped.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = "src";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

// Strip line + block comments so a rule that merely *mentions* a forbidden
// token in documentation is not treated as a violation.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, "") // whole-line comments
    .replace(/\/\/.*$/gm, ""); // trailing comments
}

const ALL_FILES = walk(SRC).map((f) => f.replace(/\\/g, "/"));

function underAny(file: string, prefixes: string[]): boolean {
  return prefixes.some((p) => file.startsWith(p));
}

function read(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

describe("architecture fitness · dependency direction", () => {
  // Reusable/shared layers must never depend on the routing layer. Routes are
  // adapters at the edge of the system; lib/components/hooks are the stable core.
  it("lib, components and hooks never import from src/routes", () => {
    const guarded = ALL_FILES.filter((f) =>
      underAny(f, ["src/lib/", "src/components/", "src/hooks/"]),
    );
    const offenders: string[] = [];
    for (const file of guarded) {
      const src = read(file);
      if (/from\s+["'](@\/routes\/|\.\.?\/routes\/|(?:\.\.\/)+routes\/)/.test(src)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(
      offenders,
      `these files import from routes/ (illegal inward dependency):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("core logic stays framework-agnostic (no router/start imports in core modules)", () => {
    // "Core" = files named *.core.ts PLUS the browser enhancement engine under
    // src/lib/enhance/ (targets/filters/capabilities/render/pipeline/worker),
    // which is the framework-agnostic compute core of the product.
    const coreFiles = ALL_FILES.filter(
      (f) =>
        /\.core\.ts$/.test(f) ||
        (/[\\/]lib[\\/]enhance[\\/]/.test(f) && /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
    );
    // Core files must exist and must be testable without the framework.
    expect(coreFiles.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of coreFiles) {
      const src = read(file);
      if (/from\s+["']@tanstack\/react-(router|start)["']/.test(src)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(
      offenders,
      `core logic must not import the router/start framework:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("architecture fitness · secret & environment boundary", () => {
  // `process.env` (server secrets) may only be read inside request handlers
  // (src/routes/**), the centralized env module, the SSR entry, or files
  // explicitly marked server-only (*.server.ts). Anything else is client-
  // reachable and would leak or crash in the browser.
  it("process.env is confined to server-only surfaces", () => {
    const allowed = (f: string) =>
      f.startsWith("src/routes/") ||
      f.startsWith("src/integrations/") ||
      f === "src/lib/env.ts" ||
      f === "src/server.ts" ||
      f === "src/start.ts" ||
      /\.server\.ts$/.test(f);

    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      if (allowed(file)) continue;
      // Test files run under Node (not shipped to the browser) and legitimately
      // reference these tokens while asserting the rules themselves.
      if (/\.test\.tsx?$/.test(file)) continue;
      if (/\bprocess\.env\b/.test(read(file))) offenders.push(relative(SRC, file));
    }
    expect(
      offenders,
      `process.env used in client-reachable modules:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("presentational components never read env or server secrets", () => {
    const components = ALL_FILES.filter(
      (f) => f.startsWith("src/components/") && !/\.test\.tsx?$/.test(f),
    );
    const offenders: string[] = [];
    for (const file of components) {
      const src = read(file);
      if (/getServerEnv|from\s+["']@\/lib\/env["']|\bprocess\.env\b/.test(src)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(
      offenders,
      `components must stay presentational (no env/secret access):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("architecture fitness · generated & governance invariants", () => {
  it("routeTree.gen.ts remains a generated file (not hand-authored)", () => {
    const banner = readFileSync("src/routeTree.gen.ts", "utf8").slice(0, 400);
    expect(banner).toContain("automatically generated by TanStack Router");
    expect(banner).toContain("You should NOT make any changes in this file");
  });

  it("business HTTP endpoints live under src/routes/api/", () => {
    // API endpoints (files declaring a `server` handler block) must be isolated
    // in the api/ bounded context, never mixed into page routes. Well-known
    // web-standard files (sitemap, robots) are served at the root by convention.
    // MCP endpoints and OAuth resource discovery are protocol-standard paths
    // that MUST live at the documented URLs (/mcp, /.mcp/*, /.well-known/*),
    // so they are exempt from the api/ bounded-context rule.
    const ROOT_CONVENTION = new Set([
      "src/routes/sitemap[.]xml.ts",
      "src/routes/mcp.ts",
      "src/routes/[.mcp]/list-tools.ts",
      "src/routes/[.mcp]/invoke-tool/$tool.ts",
      "src/routes/[.well-known]/oauth-protected-resource.ts",
    ]);
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      if (!file.startsWith("src/routes/") || file.startsWith("src/routes/api/")) continue;
      if (ROOT_CONVENTION.has(file)) continue;
      const src = read(file);
      if (/\bserver:\s*\{\s*[\s\S]*?handlers\b/.test(src)) offenders.push(relative(SRC, file));
    }
    expect(
      offenders,
      `server route handlers found outside src/routes/api/:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
