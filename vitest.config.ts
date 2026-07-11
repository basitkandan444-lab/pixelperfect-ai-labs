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
  },
});
