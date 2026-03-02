import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleRenderUrl } from "../../../src/handlers/render-url.js";
import { BrowserManager } from "../../../src/browser.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

describe("handleRenderUrl", () => {
  let browserManager: BrowserManager;

  beforeAll(() => {
    browserManager = new BrowserManager();
  });

  afterAll(async () => {
    await browserManager.shutdown();
  });

  it("renders a file:// URL", async () => {
    const url = pathToFileURL(resolve(FIXTURES, "test.html")).href;
    const result = await handleRenderUrl({ url }, browserManager);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
    const buf = Buffer.from(result.content[0].data, "base64");
    expect(buf[0]).toBe(0x89); // PNG magic
  });

  it("rejects invalid URL", async () => {
    await expect(
      handleRenderUrl({ url: "not-a-url" }, browserManager),
    ).rejects.toThrow();
  });

  it("respects viewport dimensions", async () => {
    const url = pathToFileURL(resolve(FIXTURES, "test.html")).href;
    const result = await handleRenderUrl(
      { url, width: 640, height: 480 },
      browserManager,
    );

    expect(result.content[0].type).toBe("image");
  });

  it("respects waitUntil option", async () => {
    const url = pathToFileURL(resolve(FIXTURES, "test.html")).href;
    const result = await handleRenderUrl(
      { url, waitUntil: "domcontentloaded" },
      browserManager,
    );

    expect(result.content[0].type).toBe("image");
  });
});
