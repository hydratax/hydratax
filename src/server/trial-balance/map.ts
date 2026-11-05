import { pence } from "@/server/money/pence";
import { vatReturnBoxesSchema } from "@/server/money/schemas";
import type { VatBoxes } from "@/server/hmrc/vat";
import { ct600FiguresSchema } from "@/server/money/schemas";
import type { z } from "zod";
import { poundsToPence } from "@/server/money/pence";

export type TrialBalanceLine = {
  accountCode: string;
  accountName: string;
  debitPence: number;
  creditPence: number;
  /** Suggested mapping target */
  suggestedMap?: TbMapTarget | null;
};

export type TbMapTarget =
  | "turnover"
  | "cost_of_sales"
  | "admin_expenses"
  | "other_income"
  | "tangible_assets"
  | "cash"
  | "debtors"
  | "creditors"
  | "corporation_tax"
  | "share_capital"
  | "retained_earnings"
  | "vat_output"
  | "vat_input"
  | "sales_net"
  | "purchases_net"
  | "ignore";

export type TrialBalance = {
  id: string;
  clientId: string;
  practiceId: string;
  purpose: "vat" | "ct600" | "general";
  periodStart: string;
  periodEnd: string;
  filename: string;
  lines: TrialBalanceLine[];
  mappings: Record<string, TbMapTarget>; // accountCode → target
  createdAt: string;
};

const MAP_RULES: Array<{ re: RegExp; target: TbMapTarget }> = [
  { re: /turnover|sales|revenue|income(?! tax)/i, target: "turnover" },
  { re: /cost of sales|direct cost|purchases(?!.*vat)|opening stocks|closing stocks/i, target: "cost_of_sales" },
  // Expenses before cash/bank so "Bank Charges" is not treated as cash.
  {
    re: /admin|overhead|wages|salar|director.?s?\s+salar|rent|office|expense|accountanc|legal|professional|consultanc|management|advertis|insurance|telephone|travel|postage|stationer|entertainment|donation|depreciation charge|bank charges|bank fees|rates|water|heat|power|repairs|renewals|petrol|fuel/i,
    target: "admin_expenses",
  },
  { re: /other income|interest received|bank interest/i, target: "other_income" },
  // Unpaid called-up capital is a debtor (asset), not equity.
  {
    re: /called up share capital not paid|unpaid share|share capital not paid/i,
    target: "debtors",
  },
  {
    re: /tangible|plant|machinery|equipment|fixture|fittings|property|freehold|motor vehicles?|fixed asset/i,
    target: "tangible_assets",
  },
  { re: /cash at bank|petty cash|^cash$|bank account/i, target: "cash" },
  { re: /debtor|receivable|trade debtors/i, target: "debtors" },
  // CT charge / liability before generic "payable" / expense rules.
  {
    re: /corporation tax|tax on (profit|ordinary)|taxation charge|^taxation$|ct payable|tax payable/i,
    target: "corporation_tax",
  },
  { re: /creditor|payable|trade creditors|paye|social security/i, target: "creditors" },
  {
    re: /equity share capital|share capital(?! not paid)|called up share capital(?! not paid)/i,
    target: "share_capital",
  },
  {
    re: /profit\s*&\s*loss|profit and loss|retained|reserves|p\s*&\s*l/i,
    target: "retained_earnings",
  },
  { re: /vat (on )?sales|vat output|output vat/i, target: "vat_output" },
  { re: /vat (on )?purchases|vat input|input vat/i, target: "vat_input" },
];

export function suggestMap(accountName: string, accountCode: string): TbMapTarget {
  const hay = `${accountCode} ${accountName}`;
  for (const rule of MAP_RULES) {
    if (rule.re.test(hay)) return rule.target;
  }
  return "ignore";
}

function toPenceAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") {
    // Excel often stores pounds as numbers
    return Math.round(raw * 100);
  }
  const s = String(raw)
    .trim()
    .replace(/£/g, "")
    .replace(/,/g, "")
    .replace(/\u00a0/g, " ");
  // Spreadsheet placeholders: "-", " - ", blank-ish tokens.
  if (!s || /^[-–—]+$/.test(s) || /^-\s*$/.test(s)) return 0;
  try {
    return Number(poundsToPence(s));
  } catch {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
}

function cell(
  row: Record<string, unknown>,
  ...keys: string[]
): unknown {
  const map = new Map(
    Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]),
  );
  for (const key of keys) {
    if (map.has(key.toLowerCase())) return map.get(key.toLowerCase());
  }
  return undefined;
}

/** Parse Excel/CSV row objects into trial balance lines */
export function parseTrialBalanceRows(
  rows: Array<Record<string, unknown>>,
): TrialBalanceLine[] {
  const lines: TrialBalanceLine[] = [];
  for (const row of rows) {
    const accountCode = String(
      cell(
        row,
        "account_code",
        "account code",
        "code",
        "a/c",
        "ac",
        "account",
      ) ?? "",
    ).trim();
    const accountName = String(
      cell(
        row,
        "account_name",
        "account name",
        "name",
        "description",
      ) ?? "",
    ).trim();
    if (!accountCode && !accountName) continue;

    const debitPence = toPenceAmount(
      cell(row, "debit", "dr", "debit_amount", "debit £"),
    );
    const creditPence = toPenceAmount(
      cell(row, "credit", "cr", "credit_amount", "credit £"),
    );
    if (debitPence === 0 && creditPence === 0) {
      // Single amount column with type
      const amount = toPenceAmount(cell(row, "amount", "balance", "value"));
      const side = String(cell(row, "side", "dr_cr", "type") ?? "")
        .toLowerCase();
      if (amount && (side.startsWith("c") || side === "cr")) {
        lines.push({
          accountCode: accountCode || `ROW${lines.length + 1}`,
          accountName: accountName || accountCode,
          debitPence: 0,
          creditPence: amount,
          suggestedMap: suggestMap(accountName, accountCode),
        });
        continue;
      }
      if (amount) {
        lines.push({
          accountCode: accountCode || `ROW${lines.length + 1}`,
          accountName: accountName || accountCode,
          debitPence: amount,
          creditPence: 0,
          suggestedMap: suggestMap(accountName, accountCode),
        });
        continue;
      }
      continue;
    }

    lines.push({
      accountCode: accountCode || `ROW${lines.length + 1}`,
      accountName: accountName || accountCode,
      debitPence,
      creditPence,
      suggestedMap: suggestMap(accountName, accountCode),
    });
  }
  return lines;
}

function netCredit(line: TrialBalanceLine) {
  return line.creditPence - line.debitPence;
}

function netDebit(line: TrialBalanceLine) {
  return line.debitPence - line.creditPence;
}

function sumMapped(
  tb: TrialBalance,
  target: TbMapTarget,
  mode: "credit" | "debit" | "abs",
): number {
  let total = 0;
  for (const line of tb.lines) {
    const map = tb.mappings[line.accountCode] ?? line.suggestedMap ?? "ignore";
    if (map !== target) continue;
    if (mode === "credit") total += Math.max(0, netCredit(line));
    else if (mode === "debit") total += Math.max(0, netDebit(line));
    else total += Math.abs(line.debitPence - line.creditPence);
  }
  return total;
}

export function trialBalanceToVatBoxes(tb: TrialBalance): VatBoxes {
  const box1 = sumMapped(tb, "vat_output", "credit");
  const box4 = sumMapped(tb, "vat_input", "debit");
  const box6 =
    sumMapped(tb, "sales_net", "credit") || sumMapped(tb, "turnover", "credit");
  const box7 =
    sumMapped(tb, "purchases_net", "debit") ||
    sumMapped(tb, "cost_of_sales", "debit");

  return vatReturnBoxesSchema.parse({
    vatDueSales: pence(box1),
    vatDueAcquisitions: pence(0),
    totalVatDue: pence(box1),
    vatReclaimedCurrPeriod: pence(box4),
    netVatDue: pence(Math.abs(box1 - box4)),
    totalValueSalesExVAT: pence(box6),
    totalValuePurchasesExVAT: pence(box7),
    totalValueGoodsSuppliedExVAT: pence(0),
    totalAcquisitionsExVAT: pence(0),
  });
}

export function trialBalanceToCt600Figures(
  tb: TrialBalance,
  clientId: string,
): z.infer<typeof ct600FiguresSchema> {
  const turnover = sumMapped(tb, "turnover", "credit");
  const cos = sumMapped(tb, "cost_of_sales", "debit");
  const admin = sumMapped(tb, "admin_expenses", "debit");
  const otherIncome = sumMapped(tb, "other_income", "credit");
  const tangible = sumMapped(tb, "tangible_assets", "debit");
  const cash = sumMapped(tb, "cash", "debit");
  const debtors = sumMapped(tb, "debtors", "debit");
  const creditors = sumMapped(tb, "creditors", "credit");
  // Balanced CT journals are Dr charge + Cr payable — do not abs-sum both.
  const ctCharge = sumMapped(tb, "corporation_tax", "debit");
  const ctPayable = sumMapped(tb, "corporation_tax", "credit");
  const corporationTax = Math.max(ctCharge, ctPayable);
  const share = sumMapped(tb, "share_capital", "credit");
  const retained = sumMapped(tb, "retained_earnings", "credit");

  return ct600FiguresSchema.parse({
    clientId,
    periodStart: tb.periodStart,
    periodEnd: tb.periodEnd,
    turnoverPence: pence(turnover),
    costOfSalesPence: pence(cos),
    administrativeExpensesPence: pence(admin),
    otherIncomePence: pence(otherIncome),
    tangibleAssetsPence: pence(tangible),
    cashAtBankPence: pence(cash),
    debtorsPence: pence(debtors),
    // Trade creditors only — CT payable is applied separately on the form.
    creditorsPence: pence(creditors),
    calledUpShareCapitalPence: pence(share),
    profitAndLossAccountPence: pence(
      retained || turnover + otherIncome - cos - admin - corporationTax,
    ),
    corporationTaxPence: pence(corporationTax),
  });
}

export function defaultMappings(lines: TrialBalanceLine[]): Record<string, TbMapTarget> {
  const m: Record<string, TbMapTarget> = {};
  for (const line of lines) {
    m[line.accountCode] = line.suggestedMap ?? "ignore";
  }
  return m;
}
