import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { preview } from "vite";

test("Save clip can be reopened when native video decoding fails", async (t) => {
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  t.after(() => server.close());
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-unsafe-swiftshader",
    ],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole("button", { name: "Open camera" }).click();
  await page.getByRole("button", { name: "Start set" }).click();
  const started = await page
    .locator("video")
    .evaluate((video) => video.currentTime);
  await page.waitForFunction(
    (start) => document.querySelector("video").currentTime >= start + 1.5,
    started,
  );
  await page.getByRole("button", { name: "End set" }).click();
  const ready = page.getByText("Set ready for replay.", { exact: true });
  await ready.waitFor({ timeout: 60000 });

  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Save clip" }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const original = Buffer.concat(chunks);
  assert.ok(original.length > 0);

  // Loading a blob as a video fails, while FFmpeg still gets the original bytes.
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "src",
    );
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      ...descriptor,
      set(value) {
        descriptor.set.call(
          this,
          value.startsWith("blob:") ? "data:video/webm;base64,AA==" : value,
        );
      },
    });
  });
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open video" }).click();
  await (
    await choosing
  ).setFiles({
    name: download.suggestedFilename(),
    mimeType: "video/webm",
    buffer: original,
  });
  await page.locator("#frame-controls").waitFor();
  await ready.waitFor({ timeout: 60000 });
  assert.ok(
    await page.locator("#frame").evaluate((image) => image.naturalWidth > 0),
  );
  assert.match(await page.locator("#summary").innerText(), /complete reps/);
  await page.getByRole("button", { name: "Mark rep at playhead" }).click();
  await page.getByRole("button", { name: "Half speed" }).click();
  await page.getByRole("button", { name: "Rep 1", exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector("#frame-seek").value) > 0,
  );
});
