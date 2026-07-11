import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Isolated Vitest config so the app's Vite/TanStack build config is untouched.
// Tests target the framework-agnostic core in src/lib/, not route files.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
