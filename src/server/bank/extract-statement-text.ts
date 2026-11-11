/**
 * Extract plain text from UK bank statement PDFs (digital) or photos (OCR).
 * Digital PDFs: prefer PDF.js text items rebuilt into rows (statement layout).
 * Scanned PDFs: return a clear warning — browser OCR handles those for converters.
 */

import { linesFromPdfTextItems } from "@/lib/bank/pdf-text-items-to-lines";

export type ExtractedStatementText = {
  text: string;
  method: "pdf_text" | "ocr";
  pageCount: number;
  warning?: string;
};

const MIN_USEFUL_CHARS = 80;

function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractWithPdfJs(data: Uint8Array): Promise<{
  text: string;
  pageCount: number;
} | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const pageCount = doc.numPages;
    const chunks: string[] = [];
    for (let i = 1; i <= pageCount; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = (
        content.items as Array<{ str?: string; transform?: number[] }>
      )
        .filter((it) => typeof it.str === "string" && Array.isArray(it.transform))
        .map((it) => ({
          str: it.str!,
          transform: it.transform as number[],
        }));
      const pageText = linesFromPdfTextItems(items);
      if (pageText) chunks.push(pageText);
    }
    await doc.destroy();
    return { text: tidyExtractedText(chunks.join("\n")), pageCount };
  } catch {
    return null;
  }
}

export async function extractTextFromPdf(
  data: Uint8Array,
): Promise<ExtractedStatementText> {
  const viaPdfJs = await extractWithPdfJs(data);
  if (
    viaPdfJs &&
    viaPdfJs.text.replace(/\s+/g, "").length >= MIN_USEFUL_CHARS
  ) {
    return {
      text: viaPdfJs.text,
      method: "pdf_text",
      pageCount: viaPdfJs.pageCount,
    };
  }

  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  const cleaned = tidyExtractedText(merged);

  if (cleaned.replace(/\s+/g, "").length >= MIN_USEFUL_CHARS) {
    return { text: cleaned, method: "pdf_text", pageCount: totalPages };
  }

  const best =
    (viaPdfJs?.text.length ?? 0) >= cleaned.length
      ? viaPdfJs?.text ?? cleaned
      : cleaned;

  return {
    text: best,
    method: "pdf_text",
    pageCount: viaPdfJs?.pageCount ?? totalPages,
    warning:
      best.trim().length === 0
        ? "This PDF has little extractable text (likely a scan). Use Convert on the bank desk — the browser will OCR scanned pages — or upload the bank’s CSV/Excel export."
        : "Only a small amount of text was found in the PDF. Use Convert for browser OCR, or the bank CSV export.",
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
