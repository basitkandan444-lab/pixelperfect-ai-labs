import { test, expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

import { locators, openHome, uploadImage, uploadValidImage, validImageFile } from "./helpers";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([len, name, data, crc]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    rows[row] = 0; // no filter
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, row + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function degradedQualityImageFile() {
  const width = 320;
  const height = 180;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const left = x < 92 ? 70 : x > 228 ? 190 : 70 + ((x - 92) / 136) * 120;
      const bars = Math.abs((x % 28) - 14) < 2 || Math.abs((y % 24) - 12) < 2 ? 32 : 0;
      const diagonal =
        Math.abs(x - y * 1.35 - 36) < 3 || Math.abs(width - x - y * 1.1 - 26) < 3 ? 46 : 0;
      const texture = Math.sin(x / 4) * 8 + Math.cos(y / 5) * 7;
      const v = Math.max(0, Math.min(255, left + bars + diagonal + texture));
      rgba[i] = Math.max(0, Math.min(255, v + 10));
      rgba[i + 1] = Math.max(0, Math.min(255, v + (x / width) * 24));
      rgba[i + 2] = Math.max(0, Math.min(255, v + (y / height) * 34));
      rgba[i + 3] = 255;
    }
  }
  return {
    name: "degraded-quality-gate.png",
    mimeType: "image/png",
    buffer: encodeRgbaPng(width, height, rgba),
  };
}

async function browserImageMetrics(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ({ beforeUrl, afterUrl }) => {
      const load = async (src: string) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        await img.decode();
        return img;
      };
      const beforeImg = await load(beforeUrl);
      const afterImg = await load(afterUrl);
      const canvas = document.createElement("canvas");
      canvas.width = afterImg.naturalWidth;
      canvas.height = afterImg.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("No canvas context");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(beforeImg, 0, 0, canvas.width, canvas.height);
      const baseline = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(afterImg, 0, 0);
      const output = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let abs = 0;
      let changed2 = 0;
      let changed8 = 0;
      let sumX = 0;
      let sumY = 0;
      let sumX2 = 0;
      let sumY2 = 0;
      let sumXY = 0;
      const n = canvas.width * canvas.height;
      for (let i = 0; i < output.length; i += 4) {
        const yBase = baseline[i] * 0.2126 + baseline[i + 1] * 0.7152 + baseline[i + 2] * 0.0722;
        const yOut = output[i] * 0.2126 + output[i + 1] * 0.7152 + output[i + 2] * 0.0722;
        sumX += yBase;
        sumY += yOut;
        sumX2 += yBase * yBase;
        sumY2 += yOut * yOut;
        sumXY += yBase * yOut;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(output[i + c] - baseline[i + c]);
          abs += d;
          if (d > 2) changed2++;
          if (d > 8) changed8++;
        }
      }

      const lapVariance = (buf: Uint8ClampedArray) => {
        let sum = 0;
        let sumSq = 0;
        let count = 0;
        const luma = (i: number) => buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722;
        for (let y = 1; y < canvas.height - 1; y++) {
          for (let x = 1; x < canvas.width - 1; x++) {
            const i = (y * canvas.width + x) * 4;
            const lap =
              4 * luma(i) -
              luma((y * canvas.width + x - 1) * 4) -
              luma((y * canvas.width + x + 1) * 4) -
              luma(((y - 1) * canvas.width + x) * 4) -
              luma(((y + 1) * canvas.width + x) * 4);
            sum += lap;
            sumSq += lap * lap;
            count++;
          }
        }
        const mean = sum / count;
        return sumSq / count - mean * mean;
      };

      const meanX = sumX / n;
      const meanY = sumY / n;
      const varianceX = sumX2 / n - meanX * meanX;
      const varianceY = sumY2 / n - meanY * meanY;
      const covariance = sumXY / n - meanX * meanY;
      const c1 = (0.01 * 255) ** 2;
      const c2 = (0.03 * 255) ** 2;
      const ssim =
        ((2 * meanX * meanY + c1) * (2 * covariance + c2)) /
        ((meanX * meanX + meanY * meanY + c1) * (varianceX + varianceY + c2));

      return {
        width: afterImg.naturalWidth,
        height: afterImg.naturalHeight,
        meanAbsDiff: abs / (n * 3),
        pctChannelDiffGt2: (changed2 / (n * 3)) * 100,
        pctChannelDiffGt8: (changed8 / (n * 3)) * 100,
        ssim,
        sharpnessBaseline: lapVariance(baseline),
        sharpnessOutput: lapVariance(output),
      };
    },
    {
      beforeUrl: `data:image/png;base64,${before.toString("base64")}`,
      afterUrl: `data:image/png;base64,${after.toString("base64")}`,
    },
  );
}

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

  test("downloaded 4K output is measurably enhanced, not a near-identical resize", async ({
    page,
  }) => {
    const source = degradedQualityImageFile();
    await openHome(page);
    await uploadImage(page, source, locators.imagePreview);
    await locators.enhanceButton(page).click();
    await expect(locators.downloadButton(page)).toBeVisible({ timeout: 120_000 });

    await expect(page.getByText(/Output verified: 3,840×2,160 PNG/i)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await locators.downloadButton(page).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const after = await import("node:fs/promises").then((fs) => fs.readFile(path!));
    const metrics = await browserImageMetrics(page, source.buffer, after);

    expect(metrics.width).toBe(3840);
    expect(metrics.height).toBe(2160);
    expect(metrics.meanAbsDiff).toBeGreaterThan(5);
    expect(metrics.pctChannelDiffGt2).toBeGreaterThan(50);
    expect(metrics.pctChannelDiffGt8).toBeGreaterThan(20);
    expect(metrics.ssim).toBeLessThan(0.99);
    expect(metrics.sharpnessOutput / metrics.sharpnessBaseline).toBeGreaterThan(8);
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
