import { readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { RenderSvgSchema, checkOutputSize } from "../types.js";

export async function handleRenderSvg(args: Record<string, unknown>) {
  const { svg, path, width, height } = RenderSvgSchema.parse(args);

  const svgString = svg ?? (await readFile(path!, "utf-8"));

  const fitTo =
    height != null && width == null
      ? { mode: "height" as const, value: height }
      : { mode: "width" as const, value: width ?? 800 };

  const resvg = new Resvg(svgString, { fitTo });
  const pngData = resvg.render();
  const pngBuffer = Buffer.from(pngData.asPng());

  const sizeError = checkOutputSize(pngBuffer, path ?? "<svg string>");
  if (sizeError) return sizeError;

  return {
    content: [
      {
        type: "image" as const,
        data: pngBuffer.toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}
