import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("returns bytes for small counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("flips to KB at 1024", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
  });

  it("flips to MB at 1024^2", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    expect(formatBytes(1024 * 1024 * 23.4)).toMatch(/^23\.\d+ MB$/);
  });

  it("flips to GB at 1024^3", () => {
    expect(formatBytes(1024 ** 3)).toBe("1.00 GB");
    expect(formatBytes(45.2 * 1024 ** 3)).toMatch(/^45\.\d+ GB$/);
  });

  it("uses zero decimals for large round numbers", () => {
    expect(formatBytes(150 * 1024 ** 3)).toBe("150 GB");
  });

  it("guards against non-finite or negative input", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });
});
