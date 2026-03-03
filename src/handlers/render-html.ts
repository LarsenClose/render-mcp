import { pathToFileURL } from "node:url";
import type { BrowserManager } from "../browser.js";
import { RenderHtmlSchema, checkOutputSize } from "../types.js";

export async function handleRenderHtml(
  args: Record<string, unknown>,
  browserManager: BrowserManager,
) {
  const parsed = RenderHtmlSchema.parse(args);
  const { width, height, fullPage } = parsed;

  const context = await browserManager.createContext({ width, height });
  try {
    const page = await context.newPage();

    if (parsed.html != null) {
      await page.setContent(parsed.html, { waitUntil: "load" });
    } else {
      const filePath = parsed.path!;
      const fileUrl = pathToFileURL(filePath).href;
      await page.goto(fileUrl, { waitUntil: "load" });
    }

    const screenshot = await page.screenshot({
      fullPage,
      type: "png",
    });

    const source = parsed.html != null ? "HTML string" : parsed.path!;
    const sizeError = checkOutputSize(screenshot, source);
    if (sizeError) return sizeError;

    return {
      content: [
        {
          type: "image" as const,
          data: screenshot.toString("base64"),
          mimeType: "image/png",
        },
      ],
    };
  } finally {
    await context.close();
  }
}
