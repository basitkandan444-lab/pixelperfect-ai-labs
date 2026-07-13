import { test, expect } from "@playwright/test";

import { locators, openHome, uploadImage, validImageFile } from "./helpers";

// MODULE 4 — offline / network resilience.
//
// Because enhancement now runs entirely on the user's device (no hosted
// inference, no API call), it must keep working with NO network connectivity.
// This suite flips the whole browser context offline via CDP
// (`context.setOffline`) AFTER the page and image have loaded, then proves the
// enhancement still completes end-to-end. This is the strongest possible
// evidence that zero hosted inference remains: the feature works with the
// network physically cut.

test.describe("Offline resilience", () => {
  test("enhancement completes fully while offline", async ({ page, context }) => {
    await openHome(page);
    await uploadImage(page, validImageFile(), locators.imagePreview);

    // Cut the network entirely — a hosted-inference app would fail here.
    await context.setOffline(true);
    await locators.enhanceButton(page).click();

    // The local engine produces a real result with no connectivity.
    await expect(locators.compareSlider(page)).toBeVisible();
    await expect(locators.downloadButton(page)).toBeVisible();
    await expect(locators.toast(page, /Enhanced to 4K quality/i)).toBeVisible();
  });

  test("no request is ever made to a hosted inference endpoint", async ({ page }) => {
    const inferenceRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (
        /enhance-image|gateway\.lovable|openai|replicate|fal\.|huggingface|inference/i.test(url)
      ) {
        inferenceRequests.push(url);
      }
    });

    await openHome(page);
    await uploadImage(page, validImageFile(), locators.imagePreview);
    await locators.enhanceButton(page).click();
    await expect(locators.compareSlider(page)).toBeVisible();

    expect(inferenceRequests).toEqual([]);
  });
});
