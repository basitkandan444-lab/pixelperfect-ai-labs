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
  // Production-grade engine matrix. Functional + accessibility specs run on all
  // five projects so we catch engine-specific rendering, upload, pointer,
  // keyboard and a11y differences (Blink, Gecko, WebKit) on desktop and mobile.
  //
  // Visual-regression baselines are intentionally scoped to two projects (see
  // the guard in e2e/visual.spec.ts): pixel-exact snapshots are inherently
  // per-engine and per-OS, so maintaining WebKit/Firefox baselines on top of
  // Chromium would multiply flake and maintenance cost for little added signal —
  // layout regressions surface on Chromium just as reliably. Cross-engine
  // *behaviour* is what the functional/a11y suites protect.
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
