import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Isolated Vitest config so the app's Vite/TanStack build config is untouched.
//
// Two kinds of tests live here:
//   * Framework-agnostic unit/logic tests in src/lib/ (default `node` env).
//   * React component tests (`*.test.tsx`) that opt into the `jsdom` env with a
//     `// @vitest-environment jsdom` docblock at the top of the file.
//
// Playwright end-to-end specs live under `e2e/` and run with their own runner
// (`bun run test:e2e`), so they are excluded here.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["src/test/setup.ts"],
    globals: false,
    // Coverage visibility (MODULE 4). `text` + `text-summary` print to the
    // console (and CI logs); `html` produces a browsable report; `lcov` feeds
    // external dashboards (Codecov/Sonar) without extra config.
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Only the tested, framework-agnostic business logic is measured against
      // thresholds. UI components and presentational modules are exercised by
      // Playwright (e2e), not Vitest, so counting them here would produce a
      // misleading number and a threshold that punishes the wrong layer.
      include: [
        "src/lib/enhance-image.core.ts",
        "src/lib/rate-limit.ts",
        "src/lib/metrics.ts",
        "src/lib/api-response.ts",
        "src/lib/landing.ts",
        "src/lib/build-info.ts",
        "src/lib/vitals-store.ts",
        "src/lib/ops.ts",
      ],
      // Enforceable floor. Regressions below these numbers fail CI. Set from the
      // measured baseline (which is well above), leaving headroom so honest
      // refactors don't trip the gate while real coverage loss does.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
