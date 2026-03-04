import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { MAX_OUTPUT_BYTES } from "../../src/types.js";

const ROOT = resolve(import.meta.dirname, "../..");

function sendJsonRpc(
  proc: ReturnType<typeof spawn>,
  message: Record<string, unknown>,
): void {
  proc.stdin!.write(JSON.stringify(message) + "\n");
}

function collectResponse(
  proc: ReturnType<typeof spawn>,
  timeout = 15000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for response")),
      timeout,
    );

    const rl = createInterface({ input: proc.stdout! });

    rl.once("line", (line) => {
      clearTimeout(timer);
      rl.close();
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(e);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function spawnServer() {
  return spawn("node", [resolve(ROOT, "dist/index.js")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function initializeServer(proc: ReturnType<typeof spawn>) {
  sendJsonRpc(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0" },
    },
  });
  await collectResponse(proc);

  sendJsonRpc(proc, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
}

describe("E2E stdio transport", () => {
  it("completes initialize handshake", async () => {
    const proc = spawnServer();

    try {
      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "1.0" },
        },
      });

      const response = await collectResponse(proc);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(
        (response.result as Record<string, unknown>).serverInfo,
      ).toBeDefined();
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it("lists tools after initialization", async () => {
    const proc = spawnServer();

    try {
      await initializeServer(proc);

      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      const response = await collectResponse(proc);
      expect(response.id).toBe(2);
      const tools = (response.result as Record<string, unknown>).tools as Array<
        Record<string, unknown>
      >;
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "render_html",
        "render_image",
        "render_pdf",
        "render_pdf_smart",
        "render_svg",
        "render_url",
      ]);
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it("executes render_image tool call", async () => {
    const proc = spawnServer();

    try {
      await initializeServer(proc);

      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "render_image",
          arguments: {
            path: resolve(ROOT, "tests/fixtures/test.png"),
          },
        },
      });

      const response = await collectResponse(proc);
      expect(response.id).toBe(3);
      const result = response.result as Record<string, unknown>;
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe("image");
      expect(content[0].mimeType).toBe("image/png");
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it("executes render_svg tool call", async () => {
    const proc = spawnServer();

    try {
      await initializeServer(proc);

      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "render_svg",
          arguments: {
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
          },
        },
      });

      const response = await collectResponse(proc);
      expect(response.id).toBe(5);
      const result = response.result as Record<string, unknown>;
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe("image");
      expect(content[0].mimeType).toBe("image/png");
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it("executes render_pdf_smart tool call", async () => {
    const proc = spawnServer();

    try {
      await initializeServer(proc);

      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "render_pdf_smart",
          arguments: {
            path: resolve(ROOT, "tests/fixtures/test-multipage.pdf"),
            mode: "hybrid",
          },
        },
      });

      const response = await collectResponse(proc, 30000);
      expect(response.id).toBe(4);
      const result = response.result as Record<string, unknown>;
      const content = result.content as Array<Record<string, unknown>>;
      expect(content.length).toBeGreaterThan(1);

      const hasImage = content.some((b) => b.type === "image");
      const hasText = content.some((b) => b.type === "text");
      expect(hasImage).toBe(true);
      expect(hasText).toBe(true);
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  describe("output size guard (E2E)", () => {
    const oversizedPath = resolve(tmpdir(), "render-mcp-e2e-oversized.png");

    afterEach(async () => {
      await unlink(oversizedPath).catch(() => {});
    });

    it("blocks oversized files over stdio with text error", async () => {
      // Create a file over the 3.5 MB limit
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const padding = Buffer.alloc(MAX_OUTPUT_BYTES + 1 - pngHeader.length);
      await writeFile(oversizedPath, Buffer.concat([pngHeader, padding]));

      const proc = spawnServer();
      try {
        await initializeServer(proc);

        sendJsonRpc(proc, {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: {
            name: "render_image",
            arguments: { path: oversizedPath },
          },
        });

        const response = await collectResponse(proc);
        expect(response.id).toBe(10);
        const result = response.result as Record<string, unknown>;
        const content = result.content as Array<Record<string, unknown>>;

        // Must be text error, not image blob
        expect(result.isError).toBe(true);
        expect(content[0].type).toBe("text");
        expect(content[0].type).not.toBe("image");
        expect(content[0].text).toContain("too large");

        // The response line itself must be small (not a multi-MB base64 blob)
        const responseJson = JSON.stringify(response);
        expect(responseJson.length).toBeLessThan(1024);
      } finally {
        proc.stdin!.end();
        proc.kill();
      }
    });
  });
});
