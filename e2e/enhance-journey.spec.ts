import { test, expect } from "@playwright/test";

import { locators, openHome, uploadImage, uploadValidImage, validImageFile } from "./helpers";

// MODULE 4D — the complete, happy-path Image Enhancement Journey.
// One test walks the entire experience a real user has, asserting the visible
// UI state at every step rather than internal implementation details.
//
// Enhancement runs entirely in the browser (local engine) — there is no network
// mock. The transient "loading" stage is naturally observable because the
// pipeline yields across async boundaries (image decode, worker round-trip,
// blob → data URL) before the result appears.
test.describe("Image enhancement journey", () => {
  test("upload → preview → enhance → result → compare → download", async ({ page }) => {
    // 1) User opens the application.
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 2) User uploads a valid image — the preview appears.
    await uploadImage(page, validImageFile(), locators.imagePreview);
    await expect(locators.enhanceButton(page)).toBeEnabled();

    // 4) User starts the enhancement request.
    await locators.enhanceButton(page).click();

    // 5) The processing state displays correctly (live region + progressbar).
    const status = locators.processingStatus(page);
    await expect(status).toContainText(/Enhancing to 4K/i);
    await expect(page.getByRole("progressbar", { name: /Enhancement progress/i })).toBeVisible();

    // 6) A successful result appears.
    await expect(locators.compareSlider(page)).toBeVisible();
    await expect(locators.toast(page, /Enhanced to 4K quality/i)).toBeVisible();

    // 7) The compare slider works with the keyboard (accessibility path).
    const slider = locators.compareSlider(page);
    await expect(slider).toHaveAttribute("aria-valuenow", "50");
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");

    // 8) The download action works.
    const downloadPromise = page.waitForEvent("download");
    await locators.downloadButton(page).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("pixel-perfect-pro-4k");
  });

  test("user can start over with New Image after a result", async ({ page }) => {
    await uploadValidImage(page);


    await locators.enhanceButton(page).click();
    await expect(locators.compareSlider(page)).toBeVisible();

    await locators.resetButton(page).click();

    // Back to the empty upload state — no lingering result.
    await expect(locators.uploadInput(page)).toBeAttached();
    await expect(locators.compareSlider(page)).toHaveCount(0);
  });

  test("multiple consecutive enhancements succeed (no credits, no exhaustion)", async ({
    page,
  }) => {
    await uploadValidImage(page);

    for (let i = 0; i < 3; i++) {
      await locators.enhanceButton(page).click();
      await expect(locators.compareSlider(page)).toBeVisible();
      // The result must never say anything about credits/billing/quota.
      await expect(page.getByText(/credit|billing|quota/i)).toHaveCount(0);
      await locators.resetButton(page).click();
      await uploadImage(page, validImageFile(), locators.imagePreview);
    }
  });
});
