import {
  NOTE8_KEYS,
  NOTE8_LABELS,
  resolveNote8Key,
  type BankCategory,
  type Note8Key,
} from "@/lib/bank-categories";
import type { CategorisedLine } from "@/server/bank/categorise";

export type YearEndAccountsDraft = {
  periodStart: string;
  periodEnd: string;
  turnoverPence: number;
  costOfSalesPence: number;
  grossProfitPence: number;
  adminExpensesPence: number;
  profitBeforeTaxPence: number;
  taxationPence: number;
  profitAfterTaxPence: number;
  dividendsPence: number;
  retainedBroughtForwardPence: number;
  retainedCarriedForwardPence: number;
  note8: Record<Note8Key, number>;
  note8Labels: typeof NOTE8_LABELS;
  balanceSheet: {
    fixedAssetsPence: number;
    otherDebtorsPence: number;
    cashAtBankPence: number;
    creditorsWithinOneYearPence: number;
    creditorsAfterOneYearPence: number;
    shareCapitalPence: number;
    profitAndLossReservePence: number;
    netCurrentAssetsPence: number;
    totalNetAssetsPence: number;
  };
  lineCount: number;
  uncategorisedCount: number;
};

function emptyNote8(): Record<Note8Key, number> {
  return Object.fromEntries(NOTE8_KEYS.map((k) => [k, 0])) as Record<
    Note8Key,
    number
  >;
}

/**
 * Roll categorised bank lines into Digitus-style P&L / Note 8 / BS draft.
 * Cash at bank ≈ sum of all amounts in period (opening assumed 0 unless provided).
 */
export function summariseForYearEndAccounts(
  lines: CategorisedLine[],
  opts: {
    periodStart: string;
    periodEnd: string;
    openingCashPence?: number;
    shareCapitalPence?: number;
    retainedBroughtForwardPence?: number;
    fixedAssetsPence?: number;
    otherDebtorsPence?: number;
    creditorsAfterOneYearPence?: number;
  },
): YearEndAccountsDraft {
  const inPeriod = lines.filter(
    (l) => l.dated >= opts.periodStart && l.dated <= opts.periodEnd,
  );

  let turnoverPence = 0;
  let costOfSalesPence = 0;
  let taxationPence = 0;
  let dividendsPence = 0;
  const note8 = emptyNote8();
  let uncategorisedCount = 0;

  let cashMovement = 0;

  for (const line of inPeriod) {
    cashMovement += line.amountPence;

    if (line.category === "transfer") continue;

    if (line.category === "drawings") {
      // Treat drawings as reduction of reserves / not P&L expense
      continue;
    }

    if (line.amountPence > 0) {
      if (line.category === "other_income") {
        // Fold other income into turnover for small-company P&L simplicity
        turnoverPence += line.amountPence;
      } else if (
        line.category === "turnover" ||
        line.category === "uncategorised"
      ) {
        turnoverPence += line.amountPence;
      } else {
        turnoverPence += line.amountPence;
      }
      continue;
    }

    const abs = Math.abs(line.amountPence);

    if (line.category === "tax") {
      taxationPence += abs;
      continue;
    }

    if (line.category === "cost_of_sales") {
      costOfSalesPence += abs;
      continue;
    }

    const noteKey = resolveNote8Key(line.category as BankCategory);
    if (noteKey) {
      note8[noteKey] += abs;
      continue;
    }

    if (line.category === "uncategorised") {
      uncategorisedCount += 1;
      note8.admin_expenses += abs;
      continue;
    }

    note8.admin_expenses += abs;
  }

  const adminExpensesPence = NOTE8_KEYS.reduce((s, k) => s + note8[k], 0);
  const grossProfitPence = turnoverPence - costOfSalesPence;
  const profitBeforeTaxPence = grossProfitPence - adminExpensesPence;
  const profitAfterTaxPence = profitBeforeTaxPence - taxationPence;
  const retainedBroughtForwardPence = opts.retainedBroughtForwardPence ?? 0;
  const retainedCarriedForwardPence =
    retainedBroughtForwardPence + profitAfterTaxPence - dividendsPence;

  const openingCash = opts.openingCashPence ?? 0;
  const cashAtBankPence = openingCash + cashMovement;
  const shareCapitalPence = opts.shareCapitalPence ?? 0;
  const fixedAssetsPence = opts.fixedAssetsPence ?? 0;
  const otherDebtorsPence = opts.otherDebtorsPence ?? 0;
  const creditorsWithinOneYearPence = taxationPence; // CT liability as main creditor from bank flow
  const creditorsAfterOneYearPence = opts.creditorsAfterOneYearPence ?? 0;

  const netCurrentAssetsPence =
    otherDebtorsPence + cashAtBankPence - creditorsWithinOneYearPence;
  const totalNetAssetsPence =
    fixedAssetsPence + netCurrentAssetsPence - creditorsAfterOneYearPence;

  return {
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    turnoverPence,
    costOfSalesPence,
    grossProfitPence,
    adminExpensesPence,
    profitBeforeTaxPence,
    taxationPence,
    profitAfterTaxPence,
    dividendsPence,
    retainedBroughtForwardPence,
    retainedCarriedForwardPence,
    note8,
    note8Labels: NOTE8_LABELS,
    balanceSheet: {
      fixedAssetsPence,
      otherDebtorsPence,
      cashAtBankPence,
      creditorsWithinOneYearPence,
      creditorsAfterOneYearPence,
      shareCapitalPence,
      profitAndLossReservePence: retainedCarriedForwardPence,
      netCurrentAssetsPence,
      totalNetAssetsPence,
    },
    lineCount: inPeriod.length,
    uncategorisedCount,
  };
}
