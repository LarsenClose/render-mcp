import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BrowserManager } from "../../src/browser.js";
import { createServer } from "../../src/server.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("MCP Server Integration", () => {
  let client: Client;
  let browserManager: BrowserManager;

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

  it("render_html with html string returns image content", async () => {
    const result = await client.callTool({
      name: "render_html",
      arguments: {
        html: "<html><body><h1>Integration Test</h1></body></html>",
      },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/png");
  });

  it("render_html with file path returns image content", async () => {
    const result = await client.callTool({
      name: "render_html",
      arguments: { path: resolve(FIXTURES, "test.html") },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
  });

  it("render_url returns image content", async () => {
    const url = pathToFileURL(resolve(FIXTURES, "test.html")).href;
    const result = await client.callTool({
      name: "render_url",
      arguments: { url },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<Record<string, unknown>>)[0];
    expect(block.type).toBe("image");
    expect(block.mimeType).toBe("image/png");
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
});
