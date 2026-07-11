import { defineConfig, devices } from "@playwright/test";

// End-to-end configuration. These specs drive a real browser against the running
// app to verify the *complete* user experience, not just isolated units.
//
// - `baseURL` lets specs navigate with relative paths.
// - `webServer` boots the dev server for the run and reuses an already-running
//   one locally (so `bun run dev` in another terminal is picked up), which also
//   makes the suite CI-safe: CI starts the server, contributors reuse theirs.
// - The AI gateway is never called; specs intercept `/api/enhance-image` so runs
//   are deterministic, offline and free.
const PORT = Number(process.env.E2E_PORT ?? 8080);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Visual snapshots are compared with a small tolerance; sub-pixel font
  // rendering differences must not fail an otherwise-correct layout.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
