import { describe, it, expect, afterAll } from "vitest";
import { handleRenderSvg } from "../../../src/handlers/render-svg.js";
import { resolve } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

const MINIMAL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';

describe("handleRenderSvg", () => {
  it("renders SVG string and returns PNG image block", async () => {
    const result = await handleRenderSvg({ svg: MINIMAL_SVG });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
    expect(result.content[0].data).toBeTruthy();
    // Verify valid base64 that starts with PNG magic bytes
    const buf = Buffer.from(result.content[0].data, "base64");
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
  });

  it("renders SVG file from path and returns PNG image block", async () => {
    const result = await handleRenderSvg({
      path: resolve(FIXTURES, "test.svg"),
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
  });

  it("rejects when neither svg nor path provided", async () => {
    await expect(handleRenderSvg({})).rejects.toThrow();
  });

  it("rejects when both svg and path provided", async () => {
    await expect(
      handleRenderSvg({ svg: MINIMAL_SVG, path: "/tmp/test.svg" }),
    ).rejects.toThrow(/Exactly one/);
  });

  it("respects width parameter", async () => {
    const result = await handleRenderSvg({ svg: MINIMAL_SVG, width: 200 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    // The PNG should be valid
    const buf = Buffer.from(result.content[0].data, "base64");
    expect(buf[0]).toBe(0x89);
  });

  it("handles nonexistent file path", async () => {
    await expect(
      handleRenderSvg({ path: "/nonexistent/test.svg" }),
    ).rejects.toThrow();
  });

  describe("output size guard", () => {
    const oversizedSvgPath = resolve(tmpdir(), "render-mcp-test-oversized.svg");

    afterAll(async () => {
      await unlink(oversizedSvgPath).catch(() => {});
    });

    it("blocks oversized SVG output with isError response", async () => {
      // Create an SVG with noise-like pattern that won't compress well
      // A large gradient with many stops produces a big uncompressible PNG
      let stops = "";
      for (let i = 0; i < 100; i++) {
        const color = `rgb(${(i * 2) % 256},${(i * 7) % 256},${(i * 13) % 256})`;
        stops += `<stop offset="${i}%" stop-color="${color}"/>`;
      }
      const hugeSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000">' +
        `<defs><linearGradient id="g">${stops}</linearGradient></defs>` +
        '<rect width="20000" height="20000" fill="url(#g)"/>' +
        "</svg>";
      await writeFile(oversizedSvgPath, hugeSvg);

      const result = await handleRenderSvg({
        path: oversizedSvgPath,
        width: 20000,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });
});
