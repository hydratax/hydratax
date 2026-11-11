/**
 * Browser-side statement extraction (like online PDF→CSV converters).
 * Uses PDF.js text items (row rebuild) and Tesseract OCR for scanned pages.
 */

import { linesFromPdfTextItems } from "@/lib/bank/pdf-text-items-to-lines";

export type BrowserExtractResult = {
  text: string;
  method: "pdf_text" | "ocr" | "csv" | "spreadsheet";
  pageCount: number;
  warning?: string;
};

const MIN_USEFUL_CHARS = 80;

function tidy(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfTextLayer(data: Uint8Array): Promise<{
  text: string;
  pageCount: number;
}> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const chunks: string[] = [];
  try {
    for (let i = 1; i <= pageCount; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items as Array<{ str?: string; transform?: number[] }>)
        .filter((it) => typeof it.str === "string" && Array.isArray(it.transform))
        .map((it) => ({
          str: it.str!,
          transform: it.transform as number[],
        }));
      const pageText = linesFromPdfTextItems(items);
      if (pageText) chunks.push(pageText);
    }
  } finally {
    await doc.destroy();
  }
  return { text: tidy(chunks.join("\n")), pageCount };
}

async function ocrPdfPages(data: Uint8Array): Promise<{
  text: string;
  pageCount: number;
}> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const { createWorker } = await import("tesseract.js");
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const worker = await createWorker("eng");
  const chunks: string[] = [];
  try {
    const maxPages = Math.min(pageCount, 12);
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const result = await worker.recognize(canvas);
      const pageText = tidy(result.data.text ?? "");
      if (pageText) chunks.push(pageText);
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
  return { text: tidy(chunks.join("\n")), pageCount };
}

async function ocrImageFile(file: File): Promise<BrowserExtractResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    const text = tidy(result.data.text ?? "");
    return {
      text,
      method: "ocr",
      pageCount: 1,
      warning:
        text.replace(/\s+/g, "").length < MIN_USEFUL_CHARS
          ? "OCR found little text — try a sharper photo or the bank CSV export."
          : undefined,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract plain text from a statement File in the browser.
 */
export async function extractStatementInBrowser(
  file: File,
): Promise<BrowserExtractResult> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (name.endsWith(".csv") || type.includes("csv") || type === "text/plain") {
    return {
      text: tidy(await file.text()),
      method: "csv",
      pageCount: 1,
    };
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  ) {
    // Server path handles spreadsheets reliably; pass empty here so caller posts File.
    return {
      text: "",
      method: "spreadsheet",
      pageCount: 1,
      warning: "spreadsheet",
    };
  }

  if (type.startsWith("image/") || /\.(png|jpe?g|webp|tif{1,2}|bmp)$/i.test(name)) {
    return ocrImageFile(file);
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const data = new Uint8Array(await file.arrayBuffer());
    const layered = await extractPdfTextLayer(data);
    if (layered.text.replace(/\s+/g, "").length >= MIN_USEFUL_CHARS) {
      return {
        text: layered.text,
        method: "pdf_text",
        pageCount: layered.pageCount,
      };
    }
    // Scanned / image-only PDF — OCR rendered pages (online-converter behaviour).
    const ocr = await ocrPdfPages(data);
    return {
      text: ocr.text,
      method: "ocr",
      pageCount: ocr.pageCount,
      warning:
        ocr.text.replace(/\s+/g, "").length < MIN_USEFUL_CHARS
          ? "This looks like a scanned PDF and OCR found little text. Try a clearer scan or the bank CSV/Excel export."
          : "Scanned PDF — text recovered with OCR. Check the preview before saving.",
    };
  }

  throw new Error(
    "Upload a CSV, Excel, PDF statement, or a photo (PNG/JPEG) of the statement.",
  );
}
