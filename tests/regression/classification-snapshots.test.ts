import { describe, it, expect } from "vitest";
import { analyzePdf } from "../../src/pdf-analyzer.js";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

const pdfs = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".pdf"))
  .sort();

describe("classification regression snapshots", () => {
  for (const pdf of pdfs) {
    it(`${pdf} classification is stable`, async () => {
      const pdfPath = resolve(FIXTURES, pdf);
      const { classifications, totalPages } = await analyzePdf(pdfPath, 1, 100);

      const lines = classifications.map(
        (c) =>
          `Page ${c.pageNum}: ${c.type} (${c.reason}) [${c.textContent.length} chars]`,
      );
      const snapshot = `Total pages: ${totalPages}\n${lines.join("\n")}\n`;

      await expect(snapshot).toMatchFileSnapshot(
        resolve(FIXTURES, `${pdf.replace(".pdf", "")}.classification.txt`),
      );
    });
  }
});
