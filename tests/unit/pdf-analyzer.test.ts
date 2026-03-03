import { describe, it, expect } from "vitest";
import { analyzePdf } from "../../src/pdf-analyzer.js";
import { parsePageRange } from "../../src/types.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const MULTIPAGE_PDF = resolve(FIXTURES, "test-multipage.pdf");

describe("analyzePdf", () => {
  it("classifies text-only pages as 'text' (page 1)", async () => {
    const { classifications } = await analyzePdf(MULTIPAGE_PDF, 1, 1);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].pageNum).toBe(1);
    expect(classifications[0].type).toBe("text");
    expect(classifications[0].reason).toBe("text-only page");
  });

  it("classifies pages with embedded images as 'render' (page 2)", async () => {
    const { classifications } = await analyzePdf(MULTIPAGE_PDF, 2, 2);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].pageNum).toBe(2);
    expect(classifications[0].type).toBe("render");
    expect(classifications[0].reason).toMatch(/embedded image/);
  });

  it("classifies pages with vector paths as 'render' (page 3)", async () => {
    const { classifications } = await analyzePdf(MULTIPAGE_PDF, 3, 3);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].pageNum).toBe(3);
    expect(classifications[0].type).toBe("render");
    expect(classifications[0].reason).toMatch(/path complexity/);
  });

  it("returns correct totalPages count", async () => {
    const { totalPages } = await analyzePdf(MULTIPAGE_PDF, 1, 1);

    expect(totalPages).toBe(4);
  });

  it("extracts text content for text pages", async () => {
    const { classifications } = await analyzePdf(MULTIPAGE_PDF, 1, 1);

    expect(classifications[0].textContent).toBeTruthy();
    expect(classifications[0].textContent.length).toBeGreaterThan(50);
    // Page 1 contains recognizable text about being a "test PDF fixture"
    expect(classifications[0].textContent).toContain("test PDF");
  });

  it("handles page ranges correctly (pages 2-3)", async () => {
    const { classifications, totalPages } = await analyzePdf(
      MULTIPAGE_PDF,
      2,
      3,
    );

    expect(totalPages).toBe(4);
    expect(classifications).toHaveLength(2);
    expect(classifications[0].pageNum).toBe(2);
    expect(classifications[0].type).toBe("render");
    expect(classifications[1].pageNum).toBe(3);
    expect(classifications[1].type).toBe("render");
  });

  it("classifies page 4 as text (second text-only page)", async () => {
    const { classifications } = await analyzePdf(MULTIPAGE_PDF, 4, 4);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].pageNum).toBe(4);
    expect(classifications[0].type).toBe("text");
    expect(classifications[0].reason).toBe("text-only page");
  });

  it("analyzes all 4 pages with correct classifications", async () => {
    const { classifications, totalPages } = await analyzePdf(
      MULTIPAGE_PDF,
      1,
      4,
    );

    expect(totalPages).toBe(4);
    expect(classifications).toHaveLength(4);

    // Pages 1 and 4 are text, pages 2 and 3 are render
    expect(classifications[0].type).toBe("text");
    expect(classifications[1].type).toBe("render");
    expect(classifications[2].type).toBe("render");
    expect(classifications[3].type).toBe("text");
  });

  it("throws on invalid file path", async () => {
    await expect(analyzePdf("/nonexistent/file.pdf", 1, 1)).rejects.toThrow();
  });

  it("clamps pageEnd to totalPages when it exceeds document length", async () => {
    const { classifications, totalPages } = await analyzePdf(
      MULTIPAGE_PDF,
      1,
      100,
    );

    expect(totalPages).toBe(4);
    expect(classifications).toHaveLength(4);
  });
});

describe("parsePageRange", () => {
  it('"all" returns {start:1, end:totalPages}', () => {
    const result = parsePageRange("all", 4);
    expect(result).toEqual({ start: 1, end: 4 });
  });

  it('"3" returns {start:3, end:3}', () => {
    const result = parsePageRange("3", 4);
    expect(result).toEqual({ start: 3, end: 3 });
  });

  it('"2-4" returns {start:2, end:4}', () => {
    const result = parsePageRange("2-4", 4);
    expect(result).toEqual({ start: 2, end: 4 });
  });

  it('"0" throws', () => {
    expect(() => parsePageRange("0", 4)).toThrow(/[Ii]nvalid page range/);
  });

  it('"5" throws for a 4-page PDF', () => {
    expect(() => parsePageRange("5", 4)).toThrow(/[Ii]nvalid page range/);
  });

  it('"abc" throws', () => {
    expect(() => parsePageRange("abc", 4)).toThrow(/[Ii]nvalid page range/);
  });

  it('"1" returns {start:1, end:1}', () => {
    const result = parsePageRange("1", 10);
    expect(result).toEqual({ start: 1, end: 1 });
  });

  it('"1-1" returns {start:1, end:1}', () => {
    const result = parsePageRange("1-1", 4);
    expect(result).toEqual({ start: 1, end: 1 });
  });

  it('"3-2" throws (end < start)', () => {
    expect(() => parsePageRange("3-2", 4)).toThrow(/[Ii]nvalid page range/);
  });

  it('"0-3" throws (start < 1)', () => {
    expect(() => parsePageRange("0-3", 4)).toThrow(/[Ii]nvalid page range/);
  });
});
