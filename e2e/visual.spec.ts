import { test, expect } from "@playwright/test";

import { locators, openHome, uploadValidImage } from "./helpers";

// MODULE 4E — visual regression protection. Pixel-exact snapshots are inherently
// per-engine and per-OS, so baselines are maintained for a scoped set of
// projects (desktop Chromium + Pixel 5). Firefox/WebKit run the functional and
// accessibility suites instead — layout regressions surface reliably on
// Chromium, and cross-engine visual baselines would multiply flake for little
// added signal. Animations are disabled (see playwright.config.ts) and a small
// pixel tolerance absorbs font sub-pixel noise, so these fail on real
// layout/spacing regressions — not on rendering jitter.
//
// First run creates baselines; update intentionally with:
//   bun run test:e2e -- --update-snapshots
const VISUAL_PROJECTS = new Set(["desktop-chromium", "mobile-chrome"]);

test.describe("Visual regression", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !VISUAL_PROJECTS.has(testInfo.project.name),
      "Visual baselines are scoped to desktop-chromium + mobile-chrome (see note above).",
    );
  });

  // The decorative ambient glows animate continuously; mask them so snapshots
  // capture layout/spacing, not animation phase.
  const ambientGlow = (page: import("@playwright/test").Page) =>
    page.locator('div[aria-hidden="true"].fixed.inset-0');

  test("landing page — empty upload state", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Wait for fonts to finish swapping, then give the tall page a realistic
    // window to reach two identical frames. A full-page snapshot of a long
    // marketing page needs more than the tight 5s default to stabilize on a
    // cold run (font swap + eager media), which was the source of the flake.
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("landing-empty.png", {
      fullPage: true,
      mask: [ambientGlow(page)],
      timeout: 20_000,
    });
  });

  test("workspace — ready-to-enhance state", async ({ page }) => {
    // After a valid upload but before enhancing: preview + enhance CTA visible.
    // A deterministic, high-value layout to guard (the primary conversion point).
    await uploadValidImage(page);
    await expect(locators.enhanceButton(page)).toBeVisible();
    const workspace = page.locator("#workspace");
    await expect(workspace).toHaveScreenshot("workspace-ready.png");
  });

  // The successful-result and error-state snapshots were retired with the
  // browser-first migration: the result image is now produced by the LOCAL
  // engine (device/GPU-dependent pixels, not a fixed mock), so a pixel-exact
  // baseline would be non-deterministic across machines. The result flow is
  // fully covered functionally in enhance-journey.spec.ts, and the recoverable
  // server-error state no longer exists (there is no server request to fail).
});
