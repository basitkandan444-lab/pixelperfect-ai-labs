import { test, expect } from "@playwright/test";

import {
  invalidTypeFile,
  locators,
  mockEnhanceError,
  mockEnhanceNetworkFailure,
  openHome,
  oversizedImageFile,
  uploadImage,
  uploadValidImage,
} from "./helpers";

// MODULE 4D — failure scenarios. Each verifies (a) the correct message, (b) the
// correct recovered UI state, and (c) that the experience is never broken —
// the user can always try again.
test.describe("Failure scenarios", () => {
  test("rejects an invalid file type before any request", async ({ page }) => {
    await openHome(page);
    await uploadImage(page, invalidTypeFile(), (p) => locators.toast(p, /Unsupported format/i));

    // No preview, no enhance button — the UI stayed in the empty state.
    await expect(locators.imagePreview(page)).toHaveCount(0);
    await expect(locators.enhanceButton(page)).toHaveCount(0);
  });

  test("rejects an oversized image before any request", async ({ page }) => {
    await openHome(page);
    await uploadImage(page, oversizedImageFile(), (p) => locators.toast(p, /too large/i));

    await expect(locators.imagePreview(page)).toHaveCount(0);
  });

  test("surfaces a server failure and returns to a retryable state", async ({ page }) => {
    await mockEnhanceError(page, 502, "ai_failed", "Enhancement failed. Please try again.");
    await uploadValidImage(page);

    await locators.enhanceButton(page).click();

    await expect(locators.toast(page, /Enhancement failed/i)).toBeVisible();
    // Preview is retained and the enhance button is usable again — not broken.
    await expect(locators.imagePreview(page)).toBeVisible();
    await expect(locators.enhanceButton(page)).toBeEnabled();
  });

  test("handles an AI timeout with a clear message", async ({ page }) => {
    await mockEnhanceError(page, 504, "ai_timeout", "The enhancement timed out. Please try again.");
    await uploadValidImage(page);

    await locators.enhanceButton(page).click();

    await expect(locators.toast(page, /timed out/i)).toBeVisible();
    await expect(locators.enhanceButton(page)).toBeEnabled();
  });

  test("handles a rate-limit (429) response gracefully", async ({ page }) => {
    await mockEnhanceError(page, 429, "rate_limited", "Too many requests. Please slow down.", {
      "Retry-After": "30",
    });
    await uploadValidImage(page);

    await locators.enhanceButton(page).click();

    await expect(locators.toast(page, /Too many requests/i)).toBeVisible();
    await expect(locators.enhanceButton(page)).toBeEnabled();
  });

  test("handles a dropped connection / cancellation as a network error", async ({ page }) => {
    await mockEnhanceNetworkFailure(page);
    await uploadValidImage(page);

    await locators.enhanceButton(page).click();

    await expect(locators.toast(page, /Network error/i)).toBeVisible();
    await expect(locators.enhanceButton(page)).toBeEnabled();
  });
});
