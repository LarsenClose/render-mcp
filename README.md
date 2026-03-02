# render-mcp

[![CI](https://github.com/LarsenClose/render-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LarsenClose/render-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.27-purple.svg)](https://modelcontextprotocol.io/)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that renders PDFs, HTML, URLs, and images as PNG screenshots. Purpose-built for giving AI coding assistants visual feedback on rendered artifacts.

## Features

- **Warm browser singleton** -- Playwright Chromium stays running between requests, eliminating cold-start latency
- **Native PDF rendering** -- Uses `pdftoppm` (poppler) for fast, accurate PDF rasterization (~100ms per page, no browser)
- **Image passthrough** -- Direct file read for PNG, JPEG, GIF, WebP, SVG
- **Per-request isolation** -- Each browser render gets a fresh `BrowserContext`, closed in `finally`
- **Single round-trip** -- One tool call returns the image directly in context

## Tools

| Tool           | Description                       | Browser? |
| -------------- | --------------------------------- | -------- |
| `render_pdf`   | Render a PDF page as PNG          | No       |
| `render_html`  | Render HTML string or file as PNG | Yes      |
| `render_url`   | Navigate to URL and screenshot    | Yes      |
| `render_image` | Read image file as base64         | No       |

## Installation

### Prerequisites

- Node.js >= 20
- `pdftoppm` (poppler-utils) for PDF rendering

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install poppler-utils
```

### From source

```bash
git clone https://github.com/LarsenClose/render-mcp.git
cd render-mcp
pnpm install
pnpm exec playwright install chromium
pnpm build
```

### Claude Code

Add to your Claude Code MCP configuration:

```bash
claude mcp add --scope user --transport stdio render node /path/to/render-mcp/dist/index.js
```

Or manually add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "render": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/render-mcp/dist/index.js"]
    }
  }
}
```

After restarting Claude Code, the tools are available as `mcp__render__render_pdf`, `mcp__render__render_html`, `mcp__render__render_url`, and `mcp__render__render_image`.

## Tool Reference

### `render_pdf`

Render a PDF page as a PNG image using pdftoppm.

| Parameter | Type     | Default  | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| `path`    | `string` | required | Absolute path to the PDF file |
| `page`    | `number` | `1`      | Page number (1-indexed)       |
| `dpi`     | `number` | `300`    | Resolution (72-600)           |

### `render_html`

Render HTML content or an HTML file as a PNG screenshot.

| Parameter  | Type      | Default | Description                  |
| ---------- | --------- | ------- | ---------------------------- |
| `html`     | `string`  | --      | HTML string to render        |
| `path`     | `string`  | --      | Absolute path to HTML file   |
| `width`    | `number`  | `1280`  | Viewport width in pixels     |
| `height`   | `number`  | `720`   | Viewport height in pixels    |
| `fullPage` | `boolean` | `false` | Capture full scrollable page |

Exactly one of `html` or `path` must be provided.

### `render_url`

Navigate to a URL and return a PNG screenshot.

| Parameter   | Type      | Default  | Description                                                           |
| ----------- | --------- | -------- | --------------------------------------------------------------------- |
| `url`       | `string`  | required | URL to navigate to                                                    |
| `width`     | `number`  | `1280`   | Viewport width in pixels                                              |
| `height`    | `number`  | `720`    | Viewport height in pixels                                             |
| `fullPage`  | `boolean` | `false`  | Capture full scrollable page                                          |
| `waitUntil` | `string`  | `"load"` | Navigation event: `load`, `domcontentloaded`, `networkidle`, `commit` |

### `render_image`

Read an image file and return it as base64.

| Parameter | Type     | Default  | Description                 |
| --------- | -------- | -------- | --------------------------- |
| `path`    | `string` | required | Absolute path to image file |

Supports: PNG, JPEG, GIF, WebP, SVG.

## Architecture

```
render-mcp (stdio transport)
|-- Warm Playwright Chromium (lazy singleton, auto-reconnect)
|-- PDF rendering via pdftoppm (no browser, ~100ms/page)
|-- Image passthrough (direct fs.readFile + base64)
'-- Returns: { type: "image", data: "<base64>", mimeType: "image/png" }
```

Key design decisions:

- `chromium.launch()` singleton (not `launchPersistentContext`) supports multiple isolated contexts
- New `BrowserContext` per request, closed in `finally` for full isolation
- Dependency injection for handlers enables unit testing with mocks
- `pdftoppm` for PDF over browser-based rendering for speed and accuracy

## Development

```bash
pnpm install
pnpm exec playwright install chromium

pnpm test              # Run all tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests (InMemoryTransport)
pnpm test:e2e          # E2E tests (stdio subprocess)
pnpm test:coverage     # Tests with coverage report

pnpm typecheck         # TypeScript type checking
pnpm lint              # ESLint
pnpm format:check      # Prettier
pnpm build             # Compile to dist/
```

## License

[MIT](LICENSE)
