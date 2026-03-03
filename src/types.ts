import { z } from "zod";

export const RenderPdfSchema = z.object({
  path: z.string().describe("Absolute path to the PDF file"),
  page: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Page number to render (1-indexed)"),
  dpi: z
    .number()
    .int()
    .min(72)
    .max(600)
    .default(300)
    .describe("Resolution in DPI"),
});
export type RenderPdfInput = z.infer<typeof RenderPdfSchema>;

export const RenderHtmlSchema = z
  .object({
    html: z.string().optional().describe("HTML string to render"),
    path: z
      .string()
      .optional()
      .describe("Absolute path to an HTML file to render"),
    width: z
      .number()
      .int()
      .positive()
      .default(1280)
      .describe("Viewport width in pixels"),
    height: z
      .number()
      .int()
      .positive()
      .default(720)
      .describe("Viewport height in pixels"),
    fullPage: z
      .boolean()
      .default(false)
      .describe("Capture the full scrollable page"),
  })
  .refine((data) => (data.html != null) !== (data.path != null), {
    message: "Exactly one of 'html' or 'path' must be provided",
  });
export type RenderHtmlInput = z.infer<typeof RenderHtmlSchema>;

export const RenderUrlSchema = z.object({
  url: z.string().url().describe("URL to navigate to and screenshot"),
  width: z
    .number()
    .int()
    .positive()
    .default(1280)
    .describe("Viewport width in pixels"),
  height: z
    .number()
    .int()
    .positive()
    .default(720)
    .describe("Viewport height in pixels"),
  fullPage: z
    .boolean()
    .default(false)
    .describe("Capture the full scrollable page"),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle", "commit"])
    .default("load")
    .describe("When to consider navigation finished"),
});
export type RenderUrlInput = z.infer<typeof RenderUrlSchema>;

export const RenderImageSchema = z.object({
  path: z.string().describe("Absolute path to the image file"),
});
export type RenderImageInput = z.infer<typeof RenderImageSchema>;

export const RenderPdfSmartSchema = z.object({
  path: z.string().describe("Absolute path to the PDF file"),
  pages: z
    .string()
    .default("all")
    .describe('Page range: "all", single page "3", or range "1-5" (1-indexed)'),
  dpi: z
    .number()
    .int()
    .min(72)
    .max(600)
    .default(200)
    .describe(
      "Resolution for rendered pages (default 200, lower than render_pdf since fewer pages are rendered)",
    ),
  mode: z
    .enum(["hybrid", "render", "text"])
    .default("hybrid")
    .describe(
      "hybrid: text for prose pages, images for figures (default). " +
        "render: rasterize every page (like render_pdf). " +
        "text: extract text only, no images.",
    ),
});
export type RenderPdfSmartInput = z.infer<typeof RenderPdfSmartSchema>;

/** Parse a page range string into start/end (1-indexed, inclusive). */
export function parsePageRange(
  pages: string,
  totalPages: number,
): { start: number; end: number } {
  if (pages === "all") return { start: 1, end: totalPages };

  const rangeMatch = pages.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (start < 1 || end < start || end > totalPages) {
      throw new Error(
        `Invalid page range "${pages}": must be within 1-${totalPages}`,
      );
    }
    return { start, end };
  }

  const single = parseInt(pages, 10);
  if (!Number.isNaN(single) && single >= 1 && single <= totalPages) {
    return { start: single, end: single };
  }

  throw new Error(
    `Invalid page range "${pages}": use "all", a number, or "start-end"`,
  );
}

/** Image formats accepted by the Anthropic API as image content blocks.
 *  SVG (image/svg+xml) is intentionally excluded -- the API rejects it.
 *  Use render_html to rasterize SVGs instead. */
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

export const EXTENSION_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Maximum output size in bytes. The Anthropic API rejects base64 image
 *  content blocks larger than 5 MB. Since base64 inflates by ~33%, we cap
 *  raw output at 3.5 MB (~4.67 MB base64) to stay safely under the limit.
 *  Claude Code does NOT resize MCP tool images -- the burden is on us. */
export const MAX_OUTPUT_BYTES = 3.5 * 1024 * 1024;

/** Format bytes as a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Check a buffer against the size limit. Returns an isError response if the
 *  buffer is too large, or null if it's within bounds. */
export function checkOutputSize(
  buf: Buffer,
  source: string,
): {
  content: [{ type: "text"; text: string }];
  isError: true;
} | null {
  if (buf.length <= MAX_OUTPUT_BYTES) return null;
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Output too large: ${formatBytes(buf.length)} exceeds the ` +
          `${formatBytes(MAX_OUTPUT_BYTES)} limit. Source: ${source}. ` +
          `Try reducing DPI, viewport size, or disabling fullPage.`,
      },
    ],
    isError: true,
  };
}
