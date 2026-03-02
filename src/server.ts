import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserManager } from "./browser.js";
import { handleRenderImage } from "./handlers/render-image.js";
import { handleRenderPdf } from "./handlers/render-pdf.js";
import { handleRenderHtml } from "./handlers/render-html.js";
import { handleRenderUrl } from "./handlers/render-url.js";

export function createServer(browserManager: BrowserManager): McpServer {
  const server = new McpServer({
    name: "render",
    version: "0.1.0",
  });

  server.tool(
    "render_image",
    "Read an image file and return it as base64. Supports PNG, JPEG, GIF, WebP, SVG.",
    {
      path: z.string().describe("Absolute path to the image file"),
    },
    {
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (args) => handleRenderImage(args),
  );

  server.tool(
    "render_pdf",
    "Render a PDF page as a PNG image using pdftoppm. No browser needed.",
    {
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
    },
    {
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (args) => handleRenderPdf(args),
  );

  server.tool(
    "render_html",
    "Render HTML content or an HTML file as a PNG screenshot using a headless browser.",
    {
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
    },
    {
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (args) => handleRenderHtml(args, browserManager),
  );

  server.tool(
    "render_url",
    "Navigate to a URL and return a PNG screenshot.",
    {
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
    },
    {
      readOnlyHint: true,
      openWorldHint: true,
    },
    async (args) => handleRenderUrl(args, browserManager),
  );

  return server;
}
