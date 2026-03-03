import { describe, it, expect, afterAll } from "vitest";
import { handleRenderImage } from "../../../src/handlers/render-image.js";
import { MAX_OUTPUT_BYTES } from "../../../src/types.js";
import { resolve } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

describe("handleRenderImage", () => {
  it("returns base64 PNG with correct mime type", async () => {
    const result = await handleRenderImage({
      path: resolve(FIXTURES, "test.png"),
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/png");
    expect(result.content[0].data).toBeTruthy();
    // Verify it's valid base64
    expect(() => Buffer.from(result.content[0].data, "base64")).not.toThrow();
  });

  it("throws on unsupported extension", async () => {
    await expect(handleRenderImage({ path: "/tmp/test.bmp" })).rejects.toThrow(
      /Unsupported image format/,
    );
  });

  it("throws on file not found", async () => {
    await expect(
      handleRenderImage({ path: "/nonexistent/test.png" }),
    ).rejects.toThrow();
  });

  it("supports JPEG files", async () => {
    // The handler validates extension before reading, so this tests the extension check
    await expect(
      handleRenderImage({ path: "/nonexistent/photo.jpg" }),
    ).rejects.not.toThrow(/Unsupported/);
  });

  it("supports SVG files", async () => {
    await expect(
      handleRenderImage({ path: "/nonexistent/icon.svg" }),
    ).rejects.not.toThrow(/Unsupported/);
  });

  it("supports WebP files", async () => {
    await expect(
      handleRenderImage({ path: "/nonexistent/photo.webp" }),
    ).rejects.not.toThrow(/Unsupported/);
  });

  it("supports GIF files", async () => {
    await expect(
      handleRenderImage({ path: "/nonexistent/anim.gif" }),
    ).rejects.not.toThrow(/Unsupported/);
  });

  describe("output size guard", () => {
    const oversizedPath = resolve(tmpdir(), "render-mcp-test-oversized.png");

    afterAll(async () => {
      await unlink(oversizedPath).catch(() => {});
    });

    it("blocks files exceeding 20 MB with isError response", async () => {
      // Create a file just over the limit with a valid PNG header
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const padding = Buffer.alloc(MAX_OUTPUT_BYTES + 1 - pngHeader.length);
      await writeFile(oversizedPath, Buffer.concat([pngHeader, padding]));

      const result = await handleRenderImage({ path: oversizedPath });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect((result.content[0] as { text: string }).text).toContain(
        "File too large",
      );
      expect((result as { isError: boolean }).isError).toBe(true);
    });
  });
});
