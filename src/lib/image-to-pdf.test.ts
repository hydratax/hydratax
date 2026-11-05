import { describe, expect, it } from "vitest";
import {
  isRasterImageType,
  pdfFilenameFromImage,
  rasterImageToPdf,
} from "@/lib/image-to-pdf";

/** Minimal 1×1 JPEG */
const TINY_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
    "base64",
  ),
);

describe("image to pdf", () => {
  it("detects raster types", () => {
    expect(isRasterImageType("image/jpeg")).toBe(true);
    expect(isRasterImageType("application/pdf")).toBe(false);
  });

  it("renames image filenames to .pdf", () => {
    expect(pdfFilenameFromImage("passport.jpg")).toBe("passport.pdf");
  });

  it("wraps a JPEG in a PDF", async () => {
    const pdf = await rasterImageToPdf({
      bytes: TINY_JPEG,
      contentType: "image/jpeg",
    });
    expect(pdf).not.toBeNull();
    expect(pdf![0]).toBe(0x25); // %
    expect(Buffer.from(pdf!.slice(0, 4)).toString("ascii")).toBe("%PDF");
  });
});
