import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { handleRenderHtml } from "../../../src/handlers/render-html.js";
import { BrowserManager } from "../../../src/browser.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

describe("handleRenderHtml", () => {
  let browserManager: BrowserManager;

  beforeAll(() => {
    browserManager = new BrowserManager();
  });

  afterAll(async () => {
    await browserManager.shutdown();
  });

  it("renders HTML string", async () => {
    const result = await handleRenderHtml(
      { html: "<html><body><h1>Hello</h1></body></html>" },
      browserManager,
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
    const buf = Buffer.from(result.content[0].data, "base64");
    expect(buf[0]).toBe(0x89); // PNG magic
  });

  it("renders HTML file by path", async () => {
    const result = await handleRenderHtml(
      { path: resolve(FIXTURES, "test.html") },
      browserManager,
    );

    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
  });

  it("rejects when both html and path provided", async () => {
    await expect(
      handleRenderHtml(
        { html: "<h1>Hi</h1>", path: "/some/file.html" },
        browserManager,
      ),
    ).rejects.toThrow();
  });

  it("rejects when neither html nor path provided", async () => {
    await expect(handleRenderHtml({}, browserManager)).rejects.toThrow();
  });

  it("respects viewport dimensions", async () => {
    const result = await handleRenderHtml(
      {
        html: "<html><body><h1>Test</h1></body></html>",
        width: 800,
        height: 600,
      },
      browserManager,
    );

    expect(result.content[0].type).toBe("image");
  });

  it("supports fullPage option", async () => {
    const longContent = Array(50).fill("<p>Paragraph</p>").join("");
    const result = await handleRenderHtml(
      {
        html: `<html><body>${longContent}</body></html>`,
        fullPage: true,
      },
      browserManager,
    );

    expect(result.content[0].type).toBe("image");
  });
});
