import { type Page, expect } from "@playwright/test";

// Reusable end-to-end helpers. Centralising selectors keeps the specs readable
// and means a UI change is fixed in ONE place, not across files. Selectors are
// intentionally role/label based (accessibility-first, stable) rather than
// brittle CSS or text-position selectors.
//
// NOTE: enhancement now runs entirely in the browser (no network round-trip),
// so there are no request mocks here — the specs exercise the REAL local engine.

// A real 1x1 PNG — small enough to keep tests fast, valid enough that the
// browser's FileReader produces a usable data URL and the preview renders, and
// that the local upscaler can process it end-to-end.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A valid in-memory image file for `setInputFiles`. */
export function validImageFile(name = "photo.png") {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  };
}

/** A wrong-type file to exercise client-side format validation. */
export function invalidTypeFile() {
  return {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not an image"),
  };
}

/** An oversized (>15MB) image to exercise the size guard. */
export function oversizedImageFile() {
  return {
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(15 * 1024 * 1024 + 1024, 1),
  };
}


// ---- Stable locators -------------------------------------------------------

export const locators = {
  uploadInput: (page: Page) => page.getByLabel("Upload an image to enhance"),
  imagePreview: (page: Page) => page.getByAltText("Your uploaded image preview"),
  enhanceButton: (page: Page) => page.getByRole("button", { name: /^Enhance to 4K$/i }),
  processingStatus: (page: Page) => page.getByRole("status"),
  compareSlider: (page: Page) =>
    page.locator("#workspace").getByRole("slider", { name: /compare before and after/i }),
  downloadButton: (page: Page) => page.getByRole("button", { name: /Download 4K Image/i }),
  resetButton: (page: Page) => page.getByRole("button", { name: /New Image/i }),
  toast: (page: Page, text: RegExp) => page.getByText(text),
};

/**
 * Navigate to a route and wait for the server-rendered shell to be present.
 *
 * The app is server-rendered, so headings/upload zone are visible before React
 * hydrates. This only guarantees the DOM is there — interactions still go
 * through `uploadImage`, which retries to absorb the brief hydration window (see
 * below) rather than relying on an arbitrary sleep.
 */
export async function openHome(page: Page, path = "/") {
  await page.goto(path);
  await page.getByRole("heading", { level: 1 }).waitFor();
}

/**
 * Wait until React has hydrated the upload input.
 *
 * The `<input>` is server-rendered, so its `onChange` handler is only attached
 * once the client bundle hydrates. The app sets `data-hydrated="true"` on the
 * input at that moment, giving us a deterministic signal to wait for instead of
 * re-firing the upload (which, for large files, re-transfers the whole buffer
 * over CDP on every retry — the source of the mobile oversized-upload flake).
 */
export async function waitForHydration(page: Page) {
  await expect(
    page.locator('input[aria-label="Upload an image to enhance"][data-hydrated="true"]'),
  ).toBeAttached({ timeout: 15_000 });
}

/**
 * Set a file on the upload input and wait for a specific UI reaction.
 *
 * Hydration is awaited first so the `onChange` handler is guaranteed attached;
 * the file is then transferred exactly once. A short, bounded `toPass` remains
 * only to absorb the sub-frame gap between the hydration marker and the handler
 * being live — it does NOT re-transfer large buffers on a hot loop.
 */
export async function uploadImage(
  page: Page,
  file: ReturnType<typeof validImageFile>,
  reaction: (page: Page) => ReturnType<Page["getByText"]>,
) {
  const input = locators.uploadInput(page);
  await waitForHydration(page);
  await expect(async () => {
    await input.setInputFiles(file);
    await expect(reaction(page)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

/** Load the home page and upload a valid image, asserting the preview appears. */
export async function uploadValidImage(page: Page) {
  await openHome(page);
  await uploadImage(page, validImageFile(), locators.imagePreview);
}
