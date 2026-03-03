import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BrowserManager } from "../../src/browser.js";
import { createServer } from "../../src/server.js";
import { MAX_OUTPUT_BYTES } from "../../src/types.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("MCP Server Integration", () => {
  let client: Client;
  let browserManager: BrowserManager;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    browserManager = new BrowserManager();
    const server = createServer(browserManager);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({
      name: "test-client",
      version: "1.0.0",
    });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await browserManager.shutdown();
  });

  afterEach(async () => {
    for (const f of tempFiles) {
      await unlink(f).catch(() => {});
    }
    tempFiles.length = 0;
  });

  it("lists all 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "render_html",
      "render_image",
      "render_pdf",
      "render_url",
    ]);
  });

  it("render_image returns image content", async () => {
    const result = await client.callTool({
      name: "render_image",
      arguments: { path: resolve(FIXTURES, "test.png") },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/png");
    expect(typeof block.data).toBe("string");
  });

  it("render_pdf returns image content", async () => {
    const result = await client.callTool({
      name: "render_pdf",
      arguments: { path: resolve(FIXTURES, "test.pdf") },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/png");
  });

  it("render_html with html string returns JPEG image content", async () => {
    const result = await client.callTool({
      name: "render_html",
      arguments: {
        html: "<html><body><h1>Integration Test</h1></body></html>",
      },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/jpeg");
  });

  it("render_html with file path returns image content", async () => {
    const result = await client.callTool({
      name: "render_html",
      arguments: { path: resolve(FIXTURES, "test.html") },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/jpeg");
  });

  it("render_url returns JPEG image content", async () => {
    const url = pathToFileURL(resolve(FIXTURES, "test.html")).href;
    const result = await client.callTool({
      name: "render_url",
      arguments: { url },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/jpeg");
  });

  it("returns error for nonexistent image file", async () => {
    const result = await client.callTool({
      name: "render_image",
      arguments: { path: "/nonexistent/file.png" },
    });

    expect(result.isError).toBe(true);
  });

  it("returns error for render_html with neither html nor path", async () => {
    const result = await client.callTool({
      name: "render_html",
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  describe("output size guard (end-to-end through MCP)", () => {
    it("blocks oversized render_image with text error, not image blob", async () => {
      const oversizedPath = resolve(
        tmpdir(),
        "render-mcp-integration-oversized.png",
      );
      tempFiles.push(oversizedPath);

      // Create a file over the 3.5 MB limit
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const padding = Buffer.alloc(MAX_OUTPUT_BYTES + 1 - pngHeader.length);
      await writeFile(oversizedPath, Buffer.concat([pngHeader, padding]));

      const result = await client.callTool({
        name: "render_image",
        arguments: { path: oversizedPath },
      });

      // Must be an error, not an image
      expect(result.isError).toBe(true);
      const block = (result.content as Array<Record<string, unknown>>)[0];
      expect(block.type).toBe("text");
      expect(block.type).not.toBe("image");
      expect(block.text).toContain("too large");
    });

    it("returns error for SVG files with helpful message", async () => {
      const result = await client.callTool({
        name: "render_image",
        arguments: { path: "/tmp/test.svg" },
      });

      expect(result.isError).toBe(true);
      const block = (result.content as Array<Record<string, unknown>>)[0];
      expect(block.type).toBe("text");
      expect(block.text).toContain("render_html");
    });

    it("small images pass through as image blocks, not text", async () => {
      const result = await client.callTool({
        name: "render_image",
        arguments: { path: resolve(FIXTURES, "test.png") },
      });

      expect(result.isError).toBeFalsy();
      const block = (result.content as Array<Record<string, unknown>>)[0];
      expect(block.type).toBe("image");
      // Verify the base64 data would be under 5 MB (API limit)
      const base64Size = (block.data as string).length;
      expect(base64Size).toBeLessThan(5 * 1024 * 1024);
    });
  });
});
