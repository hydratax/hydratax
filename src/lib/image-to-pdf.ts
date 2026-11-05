import { PDFDocument } from "pdf-lib";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function isRasterImageType(contentType: string): boolean {
  return IMAGE_TYPES.has(contentType.toLowerCase().split(";")[0]!.trim());
}

/**
 * Wrap a JPEG or PNG in a single-page PDF sized to the image.
 * WebP is not embeddable by pdf-lib — caller should leave those as images
 * or convert upstream.
 */
export async function rasterImageToPdf(input: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<Uint8Array | null> {
  const type = input.contentType.toLowerCase().split(";")[0]!.trim();
  if (type !== "image/jpeg" && type !== "image/jpg" && type !== "image/png") {
    return null;
  }

  const pdf = await PDFDocument.create();
  const image =
    type === "image/png"
      ? await pdf.embedPng(input.bytes)
      : await pdf.embedJpg(input.bytes);

  const width = image.width;
  const height = image.height;
  // Fit on A4-ish page while keeping aspect; prefer image pixel size when smaller.
  const maxW = 595;
  const maxH = 842;
  const scale = Math.min(1, maxW / width, maxH / height);
  const pageW = Math.max(1, Math.round(width * scale));
  const pageH = Math.max(1, Math.round(height * scale));
  const page = pdf.addPage([pageW, pageH]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pageW,
    height: pageH,
  });
  return pdf.save();
}

export function pdfFilenameFromImage(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "") || "document";
  return `${base}.pdf`;
}
