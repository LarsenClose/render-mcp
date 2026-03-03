import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/** Threshold: pages with more than this many constructPath ops likely contain
 *  diagrams, charts, or other vector graphics worth rendering. Even simple
 *  diagrams (3-4 boxes with arrows) produce 20+ path ops, while pure text
 *  pages typically have 0. Conservative: prefer rendering over missing visuals. */
const VECTOR_PATH_THRESHOLD = 15;

/** Pages with fewer characters than this are likely full-page figures or
 *  mostly-blank separator pages. */
const MIN_TEXT_CHARS = 50;

export interface PageClassification {
  pageNum: number;
  type: "text" | "render";
  reason: string;
  textContent: string;
}

/** OPS codes for embedded raster images. */
const IMAGE_OPS = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
]);

async function classifyPage(page: PDFPageProxy): Promise<PageClassification> {
  const [textContent, ops] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);

  const text = textContent.items
    .filter((item) => "str" in item && typeof item.str === "string")
    .map((item) => (item as { str: string }).str)
    .join(" ")
    .trim();

  let imageCount = 0;
  let pathCount = 0;

  for (const fn of ops.fnArray) {
    if (IMAGE_OPS.has(fn)) imageCount++;
    if (fn === OPS.constructPath) pathCount++;
  }

  const pageNum = page.pageNumber;

  if (imageCount > 0) {
    return {
      pageNum,
      type: "render",
      reason: `${imageCount} embedded image(s)`,
      textContent: text,
    };
  }

  if (text.length < MIN_TEXT_CHARS) {
    return {
      pageNum,
      type: "render",
      reason: `minimal text (${text.length} chars)`,
      textContent: text,
    };
  }

  if (pathCount > VECTOR_PATH_THRESHOLD) {
    return {
      pageNum,
      type: "render",
      reason: `${pathCount} vector paths (likely diagram)`,
      textContent: text,
    };
  }

  return {
    pageNum,
    type: "text",
    reason: "text-only page",
    textContent: text,
  };
}

/** Analyze a PDF file and classify each page in the given range.
 *  Returns classifications and total page count. */
export async function analyzePdf(
  pdfPath: string,
  pageStart: number,
  pageEnd: number,
): Promise<{ classifications: PageClassification[]; totalPages: number }> {
  const buf = await readFile(pdfPath);
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  const doc: PDFDocumentProxy = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const totalPages = doc.numPages;
  const classifications: PageClassification[] = [];

  try {
    const clampedEnd = Math.min(pageEnd, totalPages);
    for (let i = pageStart; i <= clampedEnd; i++) {
      const page = await doc.getPage(i);
      const classification = await classifyPage(page);
      classifications.push(classification);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return { classifications, totalPages };
}
