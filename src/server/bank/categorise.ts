import {
  CATEGORY_LABELS,
  type BankCategory,
} from "@/lib/bank-categories";

export type { BankCategory };
export { CATEGORY_LABELS };

export type CategorisedLine = {
  dated: string;
  description: string;
  amountPence: number;
  category: BankCategory;
  confidence: "high" | "medium" | "low";
};

const RULES: { category: BankCategory; patterns: RegExp[]; confidence: "high" | "medium" }[] = [
  {
    category: "bank_charges",
    patterns: [/bank charge/i, /monthly fee/i, /\bfee\b.*bank/i, /overdraft/i],
    confidence: "high",
  },
  {
    category: "tax",
    patterns: [/hmrc/i, /vat payment/i, /corporation tax/i, /paye/i, /nic\b/i],
    confidence: "high",
  },
  {
    category: "professional_fees",
    patterns: [/accountant/i, /\blegal\b/i, /solicitor/i, /companies house/i],
    confidence: "high",
  },
  {
    category: "premises",
    patterns: [/rent\b/i, /landlord/i, /business rates/i, /utilities/i, /electric/i, /gas bill/i],
    confidence: "medium",
  },
  {
    category: "travel",
    patterns: [/uber/i, /trainline/i, /tfl\b/i, /petrol/i, /fuel\b/i, /parking/i],
    confidence: "medium",
  },
  {
    category: "admin_expenses",
    patterns: [/microsoft/i, /adobe/i, /google workspace/i, /aws\b/i, /software/i, /subscription/i],
    confidence: "medium",
  },
  {
    category: "cost_of_sales",
    patterns: [/supplier/i, /wholesale/i, /inventory/i, /stock\b/i],
    confidence: "medium",
  },
  {
    category: "transfer",
    patterns: [/transfer/i, /to savings/i, /from savings/i, /own account/i],
    confidence: "high",
  },
  {
    category: "drawings",
    patterns: [/drawing/i, /owner withdraw/i, /personal\b/i],
    confidence: "medium",
  },
];

export function categoriseDescription(
  description: string,
  amountPence: number,
): Pick<CategorisedLine, "category" | "confidence"> {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(description))) {
      return { category: rule.category, confidence: rule.confidence };
    }
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
      // date, description, amount
      description = cols[1];
      amountPence = parseMoneyToPence(cols[2] ?? "0");
      // If amount column is absolute with type in col3
      if (cols[3]?.toLowerCase().startsWith("d")) amountPence = -Math.abs(amountPence);
      if (cols[3]?.toLowerCase().startsWith("c")) amountPence = Math.abs(amountPence);
    }

    dated = normaliseDate(dated);
    const { category, confidence } = categoriseDescription(description, amountPence);
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
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
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
