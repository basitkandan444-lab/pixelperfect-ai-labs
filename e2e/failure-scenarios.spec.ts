import { test, expect } from "@playwright/test";

import { invalidTypeFile, locators, openHome, oversizedImageFile, uploadImage } from "./helpers";

// MODULE 4D — failure scenarios. Enhancement runs locally in the browser, so the
// relevant failure modes are now client-side input validation (wrong type, too
// large) rather than server/network errors. Each verifies (a) the correct
// message, (b) the correct recovered UI state, and (c) that the experience is
// never broken — the user can always try again.
test.describe("Failure scenarios", () => {
  test("rejects an invalid file type before any processing", async ({ page }) => {
    await openHome(page);
    await uploadImage(page, invalidTypeFile(), (p) => locators.toast(p, /Unsupported format/i));

    // No preview, no enhance button — the UI stayed in the empty state.
    await expect(locators.imagePreview(page)).toHaveCount(0);
    await expect(locators.enhanceButton(page)).toHaveCount(0);
  });

  test("rejects an oversized image before any processing", async ({ page }) => {
    await openHome(page);
    await uploadImage(page, oversizedImageFile(), (p) => locators.toast(p, /too large/i));

    await expect(locators.imagePreview(page)).toHaveCount(0);
  });

  test("never surfaces credits / billing / quota messaging", async ({ page }) => {
    // The whole point of the browser-first migration: the user can never hit an
    // "AI credits exhausted" wall. Prove no such copy exists anywhere on the page.
    await openHome(page);
    await expect(page.getByText(/credit|billing|quota|api limit/i)).toHaveCount(0);
  });
});
