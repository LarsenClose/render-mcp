import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/** Threshold for vector path sub-operation complexity. Each constructPath op
 *  contains geometry entries (moveTo coords, lineTo coords, curveTo control
 *  points, etc.). A horizontal rule scores ~6, a simple box ~13, while a
 *  commutative diagram with arrows scores 200-1200. Decorative elements
 *  (borders, underlines) typically stay under 50. Threshold of 100 cleanly
 *  separates diagrams from decoration across tested LaTeX, arxiv, and
 *  general PDFs. */
const PATH_COMPLEXITY_THRESHOLD = 100;

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
  let pathComplexity = 0;

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (IMAGE_OPS.has(ops.fnArray[i])) imageCount++;
    if (ops.fnArray[i] === OPS.constructPath) {
      // Each constructPath op stores geometry data in argsArray[i][1][0].
      // When non-null, this object contains indexed coordinate entries —
      // more entries means more complex geometry (curves, multi-segment
      // paths). Null entries are stroke/fill ops with no new geometry.
      const geom = (ops.argsArray[i] as unknown[][])?.[1]?.[0];
      if (geom !== null && geom !== undefined) {
        pathComplexity += Object.keys(geom as object).length;
      }
    }
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

  if (pathComplexity > PATH_COMPLEXITY_THRESHOLD) {
    return {
      pageNum,
      type: "render",
      reason: `path complexity ${pathComplexity} (likely diagram)`,
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
