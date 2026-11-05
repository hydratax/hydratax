/**
 * Extract plain text from UK bank statement PDFs (digital) or photos (OCR).
 * Digital PDFs use unpdf (PDF.js). Scanned PDFs/images fall back to Tesseract.js.
 */

export type ExtractedStatementText = {
  text: string;
  method: "pdf_text" | "ocr";
  pageCount: number;
  warning?: string;
};

const MIN_USEFUL_CHARS = 80;

export async function extractTextFromPdf(
  data: Uint8Array,
): Promise<ExtractedStatementText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  const cleaned = tidyExtractedText(merged);

  if (cleaned.replace(/\s+/g, "").length >= MIN_USEFUL_CHARS) {
    return { text: cleaned, method: "pdf_text", pageCount: totalPages };
  }

  // Likely a scan / image-only PDF — OCR each rendered page would need canvas.
  // Fall through with a clear warning; caller may still try OCR on uploaded photos.
  return {
    text: cleaned,
    method: "pdf_text",
    pageCount: totalPages,
    warning:
      cleaned.trim().length === 0
        ? "This PDF has little extractable text (likely a scan). Upload a photo/PNG of the pages, or the bank’s CSV/Excel export."
        : "Only a small amount of text was found in the PDF. If lines are missing, try a clearer photo or the bank CSV export.",
  };
}

export async function extractTextFromImage(
  data: Uint8Array,
  mimeType: string,
): Promise<ExtractedStatementText> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    void mimeType;
    // tesseract ImageLike expects Buffer — copy off the Uint8Array view.
    const result = await worker.recognize(Buffer.from(data));
    const cleaned = tidyExtractedText(result.data.text ?? "");
    return {
      text: cleaned,
      method: "ocr",
      pageCount: 1,
      warning:
        cleaned.replace(/\s+/g, "").length < MIN_USEFUL_CHARS
          ? "OCR found little text — try a sharper photo, better lighting, or the bank CSV export."
          : undefined,
    };
  } finally {
    await worker.terminate();
  }
}

function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
