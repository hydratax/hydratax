import {
  CATEGORY_LABELS,
  type BankCategory,
} from "@/lib/bank-categories";
import { matchMerchant } from "@/server/bank/merchants";
import * as XLSX from "xlsx";

export type { BankCategory };
export { CATEGORY_LABELS };

export type CategorisedLine = {
  dated: string;
  description: string;
  amountPence: number;
  category: BankCategory;
  confidence: "high" | "medium" | "low";
};

export function categoriseDescription(
  description: string,
  amountPence: number,
): Pick<CategorisedLine, "category" | "confidence"> {
  const merchant = matchMerchant(description);
  if (merchant) {
    return { category: merchant.category, confidence: merchant.confidence };
  }
  if (amountPence > 0) {
    return { category: "turnover", confidence: "low" };
  }
  return { category: "admin_expenses", confidence: "low" };
}

/** Parse simple CSV: date,description,amount OR date,description,debit,credit */
export function parseBankCsv(text: string): CategorisedLine[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const rows = lines.slice(1);
  const out: CategorisedLine[] = [];

  for (const row of rows) {
    const cols = splitCsvRow(row);
    if (cols.length < 3) continue;

    let dated = cols[0];
    let description = cols[1];
    let amountPence = 0;

    if (header.includes("debit") && header.includes("credit")) {
      const debit = parseMoneyToPence(cols[2] ?? "0");
      const credit = parseMoneyToPence(cols[3] ?? "0");
      amountPence = credit - debit;
    } else {
      description = cols[1];
      amountPence = parseMoneyToPence(cols[2] ?? "0");
      if (cols[3]?.toLowerCase().startsWith("d")) amountPence = -Math.abs(amountPence);
      if (cols[3]?.toLowerCase().startsWith("c")) amountPence = Math.abs(amountPence);
    }

    dated = normaliseDate(dated);
    const { category, confidence } = categoriseDescription(description, amountPence);
    out.push({ dated, description, amountPence, category, confidence });
  }

  return out;
}

/** Parse Excel / CSV buffer into categorised bank lines. */
export function parseBankSpreadsheet(
  buffer: ArrayBuffer,
  filename: string,
): CategorisedLine[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseBankCsv(text);
  }

  const book = XLSX.read(buffer, { type: "array", cellDates: true });
  const first = book.SheetNames[0];
  if (!first) return [];
  const sheet = book.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).map((k) => k.trim());
  const findKey = (...candidates: string[]) =>
    keys.find((k) =>
      candidates.some((c) => k.toLowerCase().replace(/\s+/g, "") === c),
    );

  const dateKey =
    findKey("date", "dated", "transactiondate", "bookingdate", "valuedate") ??
    keys[0];
  const descKey =
    findKey(
      "description",
      "narrative",
      "details",
      "transactiondescription",
      "merchant",
      "reference",
    ) ?? keys[1];
  const amountKey = findKey("amount", "value", "transactionamount");
  const debitKey = findKey("debit", "moneyout", "out", "paidout", "withdrawal");
  const creditKey = findKey("credit", "moneyin", "in", "paidin", "deposit");

  const out: CategorisedLine[] = [];
  for (const row of rows) {
    const dated = normaliseDate(String(row[dateKey] ?? ""));
    const description = String(row[descKey] ?? "").trim();
    if (!dated || !description) continue;

    let amountPence = 0;
    if (debitKey && creditKey) {
      const debit = parseMoneyToPence(String(row[debitKey] ?? "0"));
      const credit = parseMoneyToPence(String(row[creditKey] ?? "0"));
      amountPence = credit - debit;
    } else if (amountKey) {
      amountPence = parseMoneyToPence(String(row[amountKey] ?? "0"));
    } else {
      continue;
    }

    const { category, confidence } = categoriseDescription(
      description,
      amountPence,
    );
    out.push({ dated, description, amountPence, category, confidence });
  }
  return out;
}

function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseMoneyToPence(raw: string): number {
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const neg = cleaned.startsWith("(") && cleaned.endsWith(")");
  const n = Number(cleaned.replace(/[()]/g, ""));
  if (Number.isNaN(n)) return 0;
  const pence = Math.round(n * 100);
  return neg ? -Math.abs(pence) : pence;
}

function normaliseDate(raw: string): string {
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  // Excel serial or ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const excelSerial = Number(raw);
  if (Number.isFinite(excelSerial) && excelSerial > 20000 && excelSerial < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(excelSerial));
    return epoch.toISOString().slice(0, 10);
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return raw;
}

export function summariseForSelfAssessment(lines: CategorisedLine[]) {
  let turnoverPence = 0;
  let otherIncomePence = 0;
  let expensesPence = 0;
  for (const line of lines) {
    if (line.category === "transfer" || line.category === "drawings") continue;
    if (line.amountPence > 0) {
      if (line.category === "other_income") otherIncomePence += line.amountPence;
      else turnoverPence += line.amountPence;
    } else {
      if (line.category === "tax") continue;
      expensesPence += Math.abs(line.amountPence);
    }
  }
  return { turnoverPence, otherIncomePence, expensesPence };
}

export function summariseForCorporationTax(lines: CategorisedLine[]) {
  let turnoverPence = 0;
  let expensesPence = 0;
  for (const line of lines) {
    if (line.category === "transfer" || line.category === "drawings") continue;
    if (line.amountPence > 0) turnoverPence += line.amountPence;
    else if (line.category !== "tax") expensesPence += Math.abs(line.amountPence);
  }
  const profitPence = turnoverPence - expensesPence;
  return { turnoverPence, expensesPence, profitPence };
}
