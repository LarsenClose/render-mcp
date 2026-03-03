import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { promisify } from "node:util";
import {
  RenderPdfSmartSchema,
  parsePageRange,
  checkOutputSize,
  formatBytes,
  MAX_OUTPUT_BYTES,
} from "../types.js";
import { analyzePdf } from "../pdf-analyzer.js";

const execFileAsync = promisify(execFile);

/** Render a single page with pdftoppm and return the PNG buffer. */
async function renderPage(
  pdfPath: string,
  page: number,
  dpi: number,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "pdftoppm",
    [
      "-png",
      "-r",
      String(dpi),
      "-f",
      String(page),
      "-l",
      String(page),
      "-singlefile",
      pdfPath,
    ],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout as Buffer;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export async function handleRenderPdfSmart(
  args: Record<string, unknown>,
): Promise<{ content: ContentBlock[]; isError?: boolean }> {
  const parsed = RenderPdfSmartSchema.parse(args);
  const { path, dpi, mode } = parsed;

  await access(path, constants.R_OK);

  // For "render" mode, use analyzePdf only to get totalPages, then render all
  // For "text" mode, analyze and extract text for all pages
  // For "hybrid" mode (default), analyze and route each page

  const { classifications, totalPages } = await analyzePdf(path, 1, 1);
  // Re-analyze with the actual page range now that we know totalPages
  const range = parsePageRange(parsed.pages, totalPages);

  const fullAnalysis =
    range.start === 1 && range.end === 1
      ? { classifications, totalPages }
      : await analyzePdf(path, range.start, range.end);

  const pages = fullAnalysis.classifications;
  const content: ContentBlock[] = [];
  let totalImageBytes = 0;

  // Add a summary header
  if (mode === "hybrid") {
    const textPages = pages.filter((p) => p.type === "text").length;
    const renderPages = pages.filter((p) => p.type === "render").length;
    content.push({
      type: "text",
      text:
        `PDF: ${path} (${totalPages} pages total, showing ${range.start}-${range.end})\n` +
        `Mode: hybrid — ${textPages} text-extracted, ${renderPages} rendered as images`,
    });
  }

  // Accumulate consecutive text pages into a single block
  let textAccumulator = "";

  for (const page of pages) {
    const shouldRender =
      mode === "render" || (mode === "hybrid" && page.type === "render");
    const shouldExtractText =
      mode === "text" || (mode === "hybrid" && page.type === "text");

    if (shouldExtractText) {
      textAccumulator += `\n\n--- Page ${page.pageNum} ---\n\n${page.textContent}`;
    } else if (shouldRender) {
      // Flush accumulated text first
      if (textAccumulator) {
        content.push({ type: "text", text: textAccumulator.trim() });
        textAccumulator = "";
      }

      const imageBuf = await renderPage(path, page.pageNum, dpi);
      totalImageBytes += imageBuf.length;

      // Check per-image size
      const sizeError = checkOutputSize(
        imageBuf,
        `${path} page ${page.pageNum}`,
      );
      if (sizeError) {
        content.push({
          type: "text",
          text: `Page ${page.pageNum}: ${sizeError.content[0].text}`,
        });
        continue;
      }

      // Check cumulative size — stop rendering if we'd exceed a reasonable
      // total budget (e.g., 10 images * 3.5 MB = 35 MB would be extreme)
      if (totalImageBytes > MAX_OUTPUT_BYTES * 5) {
        content.push({
          type: "text",
          text:
            `Stopped rendering at page ${page.pageNum}: cumulative image data ` +
            `(${formatBytes(totalImageBytes)}) exceeds budget. Remaining pages ` +
            `extracted as text.`,
        });
        // Switch remaining pages to text extraction
        const remaining = pages.filter((p) => p.pageNum > page.pageNum);
        for (const rem of remaining) {
          textAccumulator += `\n\n--- Page ${rem.pageNum} ---\n\n${rem.textContent}`;
        }
        break;
      }

      if (mode === "hybrid") {
        content.push({
          type: "text",
          text: `Page ${page.pageNum} (${page.reason}):`,
        });
      }

      content.push({
        type: "image",
        data: imageBuf.toString("base64"),
        mimeType: "image/png",
      });
    }
  }

  // Flush any remaining accumulated text
  if (textAccumulator) {
    content.push({ type: "text", text: textAccumulator.trim() });
  }

  // For text-only mode with no content, return at least a message
  if (content.length === 0) {
    content.push({
      type: "text",
      text: `No content extracted from ${path} pages ${range.start}-${range.end}.`,
    });
  }

  return { content };
}
