import { describe, it, expect } from "vitest";
import { handleRenderPdfSmart } from "../../../src/handlers/render-pdf-smart.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");
const MULTIPAGE_PDF = resolve(FIXTURES, "test-multipage.pdf");

describe("handleRenderPdfSmart", () => {
  describe("hybrid mode (default)", () => {
    it("returns interleaved text and image blocks for all pages", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "all",
        mode: "hybrid",
      });

      expect(result.isError).toBeUndefined();
      const { content } = result;

      // Should have a summary header as the first block
      expect(content[0].type).toBe("text");
      expect((content[0] as { type: "text"; text: string }).text).toContain(
        "hybrid",
      );

      // Should contain at least one image block (pages 2 and 3 are render)
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks.length).toBeGreaterThanOrEqual(2);

      // Should contain text blocks (pages 1 and 4 text, plus header, plus per-image labels)
      const textBlocks = content.filter((b) => b.type === "text");
      expect(textBlocks.length).toBeGreaterThanOrEqual(2);

      // Verify image blocks have valid base64 PNG data
      for (const img of imageBlocks) {
        const imgBlock = img as {
          type: "image";
          data: string;
          mimeType: string;
        };
        expect(imgBlock.mimeType).toBe("image/png");
        expect(imgBlock.data.length).toBeGreaterThan(100);
        const buf = Buffer.from(imgBlock.data, "base64");
        expect(buf[0]).toBe(0x89); // PNG magic byte
      }
    });

    it("extracts text from pages 1 and 4, renders pages 2 and 3", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "all",
        mode: "hybrid",
      });

      const { content } = result;

      // Pages 1 and 4 text should appear somewhere in text blocks
      const allText = content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      expect(allText).toContain("Page 1");
      expect(allText).toContain("Page 4");

      // Pages 2 and 3 should produce image blocks
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(2);
    });
  });

  describe("text mode", () => {
    it("returns only text blocks, no images", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "all",
        mode: "text",
      });

      expect(result.isError).toBeUndefined();
      const { content } = result;

      // No image blocks at all
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(0);

      // Should have text blocks with page content
      const textBlocks = content.filter((b) => b.type === "text");
      expect(textBlocks.length).toBeGreaterThanOrEqual(1);

      // Text should contain content from all pages
      const allText = textBlocks
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      expect(allText).toContain("Page 1");
      expect(allText).toContain("Page 4");
    });
  });

  describe("render mode", () => {
    it("returns image blocks for each page", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "all",
        mode: "render",
      });

      expect(result.isError).toBeUndefined();
      const { content } = result;

      // Every page should be rendered as an image
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(4);

      // Each should be a valid PNG
      for (const img of imageBlocks) {
        const imgBlock = img as {
          type: "image";
          data: string;
          mimeType: string;
        };
        expect(imgBlock.mimeType).toBe("image/png");
        const buf = Buffer.from(imgBlock.data, "base64");
        expect(buf[0]).toBe(0x89);
      }
    });

    it("does not include a summary header in render mode", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "all",
        mode: "render",
      });

      const textBlocks = result.content.filter((b) => b.type === "text");
      // In render mode there should be no "hybrid" summary header
      for (const t of textBlocks) {
        expect((t as { text: string }).text).not.toContain("hybrid");
      }
    });
  });

  describe("page range", () => {
    it('"1-2" returns only 2 pages of content', async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "1-2",
        mode: "render",
      });

      const imageBlocks = result.content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(2);
    });

    it("single page '1' returns just page 1", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "1",
        mode: "hybrid",
      });

      const { content } = result;
      // Page 1 is text-only, so in hybrid mode we should get text extraction
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(0);

      const allText = content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      expect(allText).toContain("Page 1");
      // Should NOT contain content from other pages
      expect(allText).not.toContain("Page 4");
    });

    it("single page '2' in hybrid mode renders as image", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
        pages: "2",
        mode: "hybrid",
      });

      const imageBlocks = result.content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(1);
    });
  });

  describe("default values", () => {
    it("pages defaults to 'all' and mode defaults to 'hybrid'", async () => {
      const result = await handleRenderPdfSmart({
        path: MULTIPAGE_PDF,
      });

      expect(result.isError).toBeUndefined();
      const { content } = result;

      // With defaults, should behave like hybrid + all pages
      // Summary header should mention "hybrid"
      expect((content[0] as { type: "text"; text: string }).text).toContain(
        "hybrid",
      );

      // Should have images (from pages 2 and 3)
      const imageBlocks = content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(2);

      // Should have text content (from pages 1 and 4)
      const allText = content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      expect(allText).toContain("Page 1");
    });
  });

  describe("error handling", () => {
    it("throws on file not found", async () => {
      await expect(
        handleRenderPdfSmart({ path: "/nonexistent/file.pdf" }),
      ).rejects.toThrow();
    });

    it('throws on invalid page range "0"', async () => {
      await expect(
        handleRenderPdfSmart({
          path: MULTIPAGE_PDF,
          pages: "0",
        }),
      ).rejects.toThrow();
    });

    it('throws on invalid page range "5" for a 4-page PDF', async () => {
      await expect(
        handleRenderPdfSmart({
          path: MULTIPAGE_PDF,
          pages: "5",
        }),
      ).rejects.toThrow();
    });
  });
});
