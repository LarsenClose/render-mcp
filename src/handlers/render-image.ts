import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  EXTENSION_TO_MIME,
  RenderImageSchema,
} from "../types.js";

export async function handleRenderImage(args: Record<string, unknown>) {
  const { path } = RenderImageSchema.parse(args);
  const ext = extname(path).toLowerCase();

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported image format '${ext}'. Supported: ${[...SUPPORTED_IMAGE_EXTENSIONS].join(", ")}`,
    );
  }

  const data = await readFile(path);
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
