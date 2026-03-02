import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

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

describe("E2E stdio transport", () => {
  it("completes initialize handshake", async () => {
    const proc = spawn("node", [resolve(ROOT, "dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });

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
    const proc = spawn("node", [resolve(ROOT, "dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      // Initialize
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

      // Send initialized notification
      sendJsonRpc(proc, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      // List tools
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
        "render_url",
      ]);
    } finally {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it("executes render_image tool call", async () => {
    const proc = spawn("node", [resolve(ROOT, "dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      // Initialize
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

      // Call render_image
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
});
