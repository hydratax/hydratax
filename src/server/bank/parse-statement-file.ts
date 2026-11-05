/**
 * Orchestrate CSV / Excel / PDF / photo → categorised bank lines.
 */

import {
  parseBankCsv,
  parseBankSpreadsheet,
  type CategorisedLine,
} from "@/server/bank/categorise";
import {
  extractTextFromImage,
  extractTextFromPdf,
} from "@/server/bank/extract-statement-text";
import { parseUkStatementText } from "@/server/bank/parse-uk-statement-text";

export type StatementParseResult = {
  lines: CategorisedLine[];
  source: "csv" | "spreadsheet" | "pdf" | "ocr";
  bankHint: string | null;
  warning?: string;
};

function isSpreadsheet(name: string, type: string) {
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  );
}

function isCsv(name: string, type: string) {
  return (
    name.endsWith(".csv") ||
    type.includes("csv") ||
    type === "text/plain"
  );
}

function isPdf(name: string, type: string) {
  return name.endsWith(".pdf") || type === "application/pdf";
}

function isImage(name: string, type: string) {
  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|tif{1,2}|bmp)$/i.test(name)
  );
}

export async function parseBankStatementFile(
  file: File,
): Promise<StatementParseResult> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (isCsv(name, type)) {
    const text = await file.text();
    return {
      lines: parseBankCsv(text),
      source: "csv",
      bankHint: null,
    };
  }

  if (isSpreadsheet(name, type)) {
    const buffer = await file.arrayBuffer();
    return {
      lines: parseBankSpreadsheet(buffer, file.name),
      source: "spreadsheet",
      bankHint: null,
    };
  }

  if (isPdf(name, type)) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractTextFromPdf(buffer);
    const parsed = parseUkStatementText(extracted.text);
    return {
      lines: parsed.lines,
      source: "pdf",
      bankHint: parsed.meta.bankHint,
      warning: extracted.warning,
    };
  }

  if (isImage(name, type)) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractTextFromImage(
      buffer,
      type || "image/png",
    );
    const parsed = parseUkStatementText(extracted.text);
    return {
      lines: parsed.lines,
      source: "ocr",
      bankHint: parsed.meta.bankHint,
      warning: extracted.warning,
    };
  }

  throw new Error(
    "Upload a CSV, Excel, PDF statement, or a photo (PNG/JPEG) of the statement.",
  );
}
