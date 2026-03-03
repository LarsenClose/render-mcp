import type { BrowserManager } from "../browser.js";
import { RenderUrlSchema, checkOutputSize } from "../types.js";

export async function handleRenderUrl(
  args: Record<string, unknown>,
  browserManager: BrowserManager,
) {
  const { url, width, height, fullPage, waitUntil } =
    RenderUrlSchema.parse(args);

  const context = await browserManager.createContext({ width, height });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil });

    const screenshot = await page.screenshot({
      fullPage,
      type: "jpeg",
      quality: 80,
    });

    const sizeError = checkOutputSize(screenshot, url);
    if (sizeError) return sizeError;

    return {
      content: [
        {
          type: "image" as const,
          data: screenshot.toString("base64"),
          mimeType: "image/jpeg",
        },
      ],
    };
  } finally {
    await context.close();
  }
}
