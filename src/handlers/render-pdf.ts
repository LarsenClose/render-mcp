import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { promisify } from "node:util";
import { RenderPdfSchema, checkOutputSize } from "../types.js";

const execFileAsync = promisify(execFile);

export async function handleRenderPdf(args: Record<string, unknown>) {
  const { path, page, dpi } = RenderPdfSchema.parse(args);

  await access(path, constants.R_OK);

  const { stdout } = await execFileAsync(
    "pdftoppm",
    [
      "-png",
      "-r",
      String(dpi),
      "-f",
      String(page),
      "-l",
      String(page),
      "-singlefile",
      path,
    ],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
  );

  const buf = stdout as Buffer;
  const sizeError = checkOutputSize(buf, `${path} (page ${page}, ${dpi} DPI)`);
  if (sizeError) return sizeError;

  return {
    content: [
      {
        type: "image" as const,
        data: buf.toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}
