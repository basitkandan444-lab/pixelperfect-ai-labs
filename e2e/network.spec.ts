import { test, expect } from "@playwright/test";

import { locators, openHome, uploadImage, validImageFile } from "./helpers";

// MODULE 4 — network resilience.
//
// `failure-scenarios.spec.ts` mocks a single aborted request at the route layer.
// This suite instead flips the whole browser context offline via CDP
// (`context.setOffline`) — the closest deterministic analogue to a user losing
// connectivity mid-session. It verifies the app degrades gracefully rather than
// hanging or throwing: the enhance request fails, a clear recovery message is
// shown, and the workspace returns to a retryable state. When connectivity is
// restored the same action succeeds, proving the failure was transient-safe and
// left no corrupt state behind.
//
// Offline is toggled AFTER the page has loaded and the image is uploaded (both
// are client-only, no network), so only the `/api/enhance-image` call is
// affected — keeping the scenario surgical and deterministic.

test.describe("Network resilience", () => {
  test("enhancing while offline shows a recovery message and stays retryable", async ({
    page,
    context,
  }) => {
    await openHome(page);
    await uploadImage(page, validImageFile(), locators.imagePreview);

    await context.setOffline(true);
    await locators.enhanceButton(page).click();

    await expect(locators.toast(page, /Network error/i)).toBeVisible();
    // The workspace is intact and the action can be retried — nothing is broken.
    await expect(locators.imagePreview(page)).toBeVisible();
    await expect(locators.enhanceButton(page)).toBeEnabled();
  });

  test("recovers and succeeds once connectivity is restored", async ({ page, context }) => {
    // A deterministic success response for the retry (offline is toggled, not
    // the route mock, so we install the mock up front and it applies on retry).
    await page.route("**/api/enhance-image", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            image:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            scale: "4k",
          },
        }),
      });
    });

    await openHome(page);
    await uploadImage(page, validImageFile(), locators.imagePreview);

    // First attempt fails offline...
    await context.setOffline(true);
    await locators.enhanceButton(page).click();
    await expect(locators.toast(page, /Network error/i)).toBeVisible();

    // ...then connectivity returns and the retry succeeds end-to-end.
    await context.setOffline(false);
    await locators.enhanceButton(page).click();
    await expect(locators.compareSlider(page)).toBeVisible();
    await expect(locators.downloadButton(page)).toBeVisible();
  });
});
