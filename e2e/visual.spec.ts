import { test, expect } from "@playwright/test";

import { locators, mockEnhanceSuccess, openHome, uploadValidImage } from "./helpers";

// MODULE 4E — visual regression protection. Snapshots run across the config's
// projects (desktop + Pixel 5), so each captures a per-device, per-platform
// baseline automatically. Animations are disabled (see playwright.config.ts) and
// a small pixel tolerance absorbs font sub-pixel noise, so these fail on real
// layout/spacing regressions — not on rendering jitter.
//
// First run creates baselines; update intentionally with:
//   bun run test:e2e -- --update-snapshots
test.describe("Visual regression", () => {
  // The decorative ambient glows animate continuously; mask them so snapshots
  // capture layout/spacing, not animation phase.
  const ambientGlow = (page: import("@playwright/test").Page) =>
    page.locator('div[aria-hidden="true"].fixed.inset-0');

  test("landing page — empty upload state", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot("landing-empty.png", {
      fullPage: true,
      mask: [ambientGlow(page)],
    });
  });

  test("workspace — successful result state", async ({ page }) => {
    await mockEnhanceSuccess(page);
    await uploadValidImage(page);
    await locators.enhanceButton(page).click();
    await expect(locators.compareSlider(page)).toBeVisible();

    // Snapshot just the workspace card to keep the assertion focused and stable.
    const workspace = page.locator("#workspace");
    await expect(workspace).toHaveScreenshot("workspace-result.png");
  });
});
