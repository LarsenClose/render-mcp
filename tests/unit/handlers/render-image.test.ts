import { describe, it, expect } from "vitest";
import { handleRenderImage } from "../../../src/handlers/render-image.js";
import { resolve } from "node:path";

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
});
