import { describe, it, expect } from "vitest";
import { handleRenderPdf } from "../../../src/handlers/render-pdf.js";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

describe("handleRenderPdf", () => {
  it("renders page 1 at default DPI", async () => {
    const result = await handleRenderPdf({
      path: resolve(FIXTURES, "test.pdf"),
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
    expect(result.content[0].data.length).toBeGreaterThan(100);
    // Verify valid base64 that decodes to PNG
    const buf = Buffer.from(result.content[0].data, "base64");
    expect(buf[0]).toBe(0x89); // PNG magic byte
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
  });

  it("renders with custom page and DPI", async () => {
    const result = await handleRenderPdf({
      path: resolve(FIXTURES, "test.pdf"),
      page: 1,
      dpi: 150,
    });

    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
  });

  it("throws on file not found", async () => {
    await expect(
      handleRenderPdf({ path: "/nonexistent/file.pdf" }),
    ).rejects.toThrow();
  });

  it("applies default values for page and dpi", async () => {
    // Just path, no page/dpi
    const result = await handleRenderPdf({
      path: resolve(FIXTURES, "test.pdf"),
    });
    expect(result.content[0].type).toBe("image");
  });
});
