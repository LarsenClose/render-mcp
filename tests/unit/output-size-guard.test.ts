import { describe, it, expect } from "vitest";
import { checkOutputSize, MAX_OUTPUT_BYTES } from "../../src/types.js";

describe("checkOutputSize", () => {
  it("returns null for buffers within the limit", () => {
    const buf = Buffer.alloc(1024);
    expect(checkOutputSize(buf, "test")).toBeNull();
  });

  it("returns null for buffers exactly at the limit", () => {
    const buf = Buffer.alloc(MAX_OUTPUT_BYTES);
    expect(checkOutputSize(buf, "test")).toBeNull();
  });

  it("returns isError response for buffers exceeding the limit", () => {
    const buf = Buffer.alloc(MAX_OUTPUT_BYTES + 1);
    const result = checkOutputSize(buf, "big-file.png");

    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.content).toHaveLength(1);
    expect(result!.content[0].type).toBe("text");
    expect(result!.content[0].text).toContain("Output too large");
    expect(result!.content[0].text).toContain("big-file.png");
  });

  it("includes the source identifier in the error message", () => {
    const buf = Buffer.alloc(MAX_OUTPUT_BYTES + 1);
    const result = checkOutputSize(buf, "/path/to/huge.pdf (page 1, 600 DPI)");

    expect(result!.content[0].text).toContain(
      "/path/to/huge.pdf (page 1, 600 DPI)",
    );
  });

  it("includes human-readable sizes in the error message", () => {
    const buf = Buffer.alloc(4 * 1024 * 1024); // 4 MB -- over the 3.5 MB limit
    const result = checkOutputSize(buf, "test");

    expect(result).not.toBeNull();
    expect(result!.content[0].text).toContain("4.0 MB");
    expect(result!.content[0].text).toContain("3.5 MB limit");
  });

  it("enforces a limit that keeps base64 output under 5 MB", () => {
    // The Anthropic API rejects base64 image blocks > 5 MB.
    // MAX_OUTPUT_BYTES (3.5 MB raw) * 4/3 ≈ 4.67 MB base64 -- safely under.
    const base64Limit = 5 * 1024 * 1024;
    const maxBase64Size = Math.ceil(MAX_OUTPUT_BYTES / 3) * 4;
    expect(maxBase64Size).toBeLessThan(base64Limit);
  });
});
