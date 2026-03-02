#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserManager } from "./browser.js";
import { createServer } from "./server.js";

const browserManager = new BrowserManager();
const server = createServer(browserManager);

async function shutdown() {
  await browserManager.shutdown();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
