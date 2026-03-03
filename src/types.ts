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

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);

export const EXTENSION_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** Maximum output size in bytes (20 MB). Buffers exceeding this are rejected
 *  with a text error so the response never bloats the context window. */
export const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

/** Format bytes as a human-readable string. */
function formatBytes(bytes: number): string {
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
