import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  EXTENSION_TO_MIME,
  RenderImageSchema,
  MAX_OUTPUT_BYTES,
  checkOutputSize,
} from "../types.js";

export async function handleRenderImage(args: Record<string, unknown>) {
  const { path } = RenderImageSchema.parse(args);
  const ext = extname(path).toLowerCase();

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    const hint =
      ext === ".svg"
        ? " SVGs are not supported by the Anthropic API as image blocks. Use render_html to rasterize SVGs instead."
        : "";
    throw new Error(
      `Unsupported image format '${ext}'. Supported: ${[...SUPPORTED_IMAGE_EXTENSIONS].join(", ")}.${hint}`,
    );
  }

  // Pre-read size check -- avoid loading huge files into memory
  const stats = await stat(path);
  if (stats.size > MAX_OUTPUT_BYTES) {
    const mb = (stats.size / (1024 * 1024)).toFixed(1);
    return {
      content: [
        {
          type: "text" as const,
          text:
            `File too large: ${mb} MB exceeds the ` +
            `${(MAX_OUTPUT_BYTES / (1024 * 1024)).toFixed(0)} MB limit. ` +
            `Source: ${path}`,
        },
      ],
      isError: true,
    };
  }

  const data = await readFile(path);
  const sizeError = checkOutputSize(data, path);
  if (sizeError) return sizeError;

  const mimeType = EXTENSION_TO_MIME[ext];

  return {
    content: [
      {
        type: "image" as const,
        data: data.toString("base64"),
        mimeType,
      },
    ],
  };
}
