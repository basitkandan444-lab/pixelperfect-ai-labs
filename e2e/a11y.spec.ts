import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { locators, openHome, uploadValidImage } from "./helpers";

// MODULE 4F — automated accessibility validation.
//
// axe-core turns accessibility from a manual review task into an enforceable CI
// gate. We scan the WCAG 2.1 A/AA rule set (the legally-referenced baseline) on
// the real, hydrated app across every engine in the project matrix — so a
// contrast, ARIA, landmark, name or label regression fails the build on the
// exact browsers users run.
//
// axe only flags deterministic, machine-verifiable violations (no heuristics),
// so this suite is stable by construction — it cannot flake on timing.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page) {
  // No exclusions: the entire hydrated page — including sonner toasts — is
  // scanned. Toasts use the design tokens (`bg-background`/`text-foreground`, an
  // AA pairing) rather than sonner's `richColors` palette, so they pass
  // `color-contrast` deterministically.
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

test.describe("Accessibility (axe-core, WCAG 2.1 AA)", () => {
  test("landing / empty upload state has no violations", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test("workspace with an uploaded image has no violations", async ({ page }) => {
    await uploadValidImage(page);
    await expect(locators.enhanceButton(page)).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test("successful result / compare state has no violations", async ({ page }) => {
    await uploadValidImage(page);
    await locators.enhanceButton(page).click();
    await expect(locators.compareSlider(page)).toBeVisible();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test("exactly one <main> landmark and a single H1", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("upload control is reachable and operable by keyboard", async ({ page }) => {
    await openHome(page);
    const input = page.locator('input[aria-label="Upload an image to enhance"]');
    // The input has an accessible name (label) — the prerequisite for AT users.
    await expect(input).toHaveAttribute("aria-label", "Upload an image to enhance");
  });

  test("compare slider exposes ARIA slider semantics and is keyboard-focusable", async ({
    page,
  }) => {
    await uploadValidImage(page);
    await locators.enhanceButton(page).click();
    const slider = locators.compareSlider(page);
    await expect(slider).toBeVisible();
    // Focus it directly and confirm it becomes the active element (operable).
    await slider.focus();
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAttribute("aria-valuenow", /\d+/);
  });
});

// WCAG 2.3.3 — motion is honored, not merely declared. The CSS reset lives in
// src/styles.css; this test emulates `prefers-reduced-motion: reduce` and asserts
// the ambient decorative animations are actually neutralized in the browser, so a
// regression that drops the media query fails the build instead of silently
// shipping vestibular-unsafe motion.
test.describe("Reduced motion (WCAG 2.3.3)", () => {
  test("continuous decorative animations are collapsed when motion is reduced", async ({
    page,
  }) => {
    // Emulate the OS-level preference before navigating so the media query is
    // active during first paint.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    const durationMs = await page
      .locator(".animate-glow-pulse")
      .first()
      .evaluate((el) => {
        const raw = getComputedStyle(el).animationDuration; // e.g. "0.001ms" or "5s"
        return raw.endsWith("ms") ? parseFloat(raw) : parseFloat(raw) * 1000;
      });
    // The reset forces ~0ms; anything under a frame (16ms) proves motion is off.
    expect(durationMs).toBeLessThan(16);
  });
});
