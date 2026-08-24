import {
  NOTE8_KEYS,
  NOTE8_LABELS,
  isCustomCategoryId,
  resolveNote8Key,
  rollsToTradeDebtors,
  type BankCategory,
  type Note8Key,
} from "@/lib/bank-categories";
import {
  EMPTY_COMPARATIVES,
  parseComparatives,
  priorGrossProfit,
  priorProfitAfterTax,
  priorProfitBeforeTax,
  type PriorYearComparatives,
} from "@/lib/accounting-periods";
import type { CategorisedLine } from "@/server/bank/categorise";

/** null = not provided — show blank on statements. */
export type StatementAmount = number | null;

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
  retainedBroughtForwardPence: StatementAmount;
  retainedCarriedForwardPence: StatementAmount;
  openingCashPence: StatementAmount;
  cashMovementPence: number;
  closingCashPence: StatementAmount;
  note8: Record<Note8Key, number>;
  note8Labels: typeof NOTE8_LABELS;
  customExpensesPence: Record<string, number>;
  balanceSheet: {
    fixedAssetsPence: StatementAmount;
    otherDebtorsPence: number;
    cashAtBankPence: StatementAmount;
    creditorsWithinOneYearPence: number;
    creditorsAfterOneYearPence: StatementAmount;
    shareCapitalPence: StatementAmount;
    profitAndLossReservePence: StatementAmount;
    netCurrentAssetsPence: StatementAmount;
    totalNetAssetsPence: StatementAmount;
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

function optAmount(value: number | undefined): StatementAmount {
  return value === undefined ? null : value;
}

/**
 * Roll categorised bank lines into Digitus-style P&L / Note 8 / BS draft.
 * Opening balances and prior-year figures stay null unless explicitly supplied.
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
    customCategoryLabels?: Record<string, string>;
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
  const customExpensesPence: Record<string, number> = {};
  let uncategorisedCount = 0;
  let tradeDebtorsFromQueriesPence = 0;

  let cashMovement = 0;

  for (const line of inPeriod) {
    cashMovement += line.amountPence;

    if (line.category === "transfer") continue;

    if (line.category === "drawings") continue;

    if (line.amountPence > 0) {
      if (
        line.category === "other_income" ||
        line.category === "turnover" ||
        line.category === "uncategorised"
      ) {
        turnoverPence += line.amountPence;
      } else if (!isCustomCategoryId(line.category)) {
        turnoverPence += line.amountPence;
      }
      continue;
    }

    const abs = Math.abs(line.amountPence);

    if (line.category === "tax") {
      taxationPence += abs;
      continue;
    }

    if (line.category === "dividends") {
      dividendsPence += abs;
      continue;
    }

    if (line.category === "cost_of_sales") {
      costOfSalesPence += abs;
      continue;
    }

    if (rollsToTradeDebtors(line.category)) {
      tradeDebtorsFromQueriesPence += abs;
      continue;
    }

    if (isCustomCategoryId(line.category)) {
      const label =
        opts.customCategoryLabels?.[line.category] ?? "Custom expenses";
      customExpensesPence[label] = (customExpensesPence[label] ?? 0) + abs;
      continue;
    }

    const noteKey = resolveNote8Key(line.category as BankCategory);
    if (noteKey) {
      note8[noteKey] += abs;
      continue;
    }

    if (line.category === "uncategorised") {
      uncategorisedCount += 1;
      tradeDebtorsFromQueriesPence += abs;
      continue;
    }

    note8.admin_expenses += abs;
  }

  const customTotal = Object.values(customExpensesPence).reduce(
    (s, v) => s + v,
    0,
  );
  const adminExpensesPence =
    NOTE8_KEYS.reduce((s, k) => s + note8[k], 0) + customTotal;
  const grossProfitPence = turnoverPence - costOfSalesPence;
  const profitBeforeTaxPence = grossProfitPence - adminExpensesPence;
  const profitAfterTaxPence = profitBeforeTaxPence - taxationPence;

  const retainedBroughtForwardPence = optAmount(
    opts.retainedBroughtForwardPence,
  );
  const retainedCarriedForwardPence =
    retainedBroughtForwardPence === null
      ? null
      : retainedBroughtForwardPence + profitAfterTaxPence - dividendsPence;

  const openingCashPence = optAmount(opts.openingCashPence);
  const cashMovementPence = cashMovement;
  const closingCashPence =
    openingCashPence === null ? null : openingCashPence + cashMovementPence;

  const shareCapitalPence = optAmount(opts.shareCapitalPence);
  const fixedAssetsPence = optAmount(opts.fixedAssetsPence);
  const otherDebtorsPence =
    (opts.otherDebtorsPence ?? 0) + tradeDebtorsFromQueriesPence;
  const creditorsWithinOneYearPence = taxationPence;
  const creditorsAfterOneYearPence = optAmount(opts.creditorsAfterOneYearPence);

  const netCurrentAssetsPence =
    closingCashPence === null
      ? null
      : otherDebtorsPence +
        closingCashPence -
        creditorsWithinOneYearPence;

  const profitAndLossReservePence = retainedCarriedForwardPence;

  const totalNetAssetsPence =
    fixedAssetsPence === null || netCurrentAssetsPence === null
      ? null
      : fixedAssetsPence +
        netCurrentAssetsPence -
        (creditorsAfterOneYearPence ?? 0);

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
    openingCashPence,
    cashMovementPence,
    closingCashPence,
    note8,
    note8Labels: NOTE8_LABELS,
    customExpensesPence,
    balanceSheet: {
      fixedAssetsPence,
      otherDebtorsPence,
      cashAtBankPence: closingCashPence,
      creditorsWithinOneYearPence,
      creditorsAfterOneYearPence,
      shareCapitalPence,
      profitAndLossReservePence,
      netCurrentAssetsPence,
      totalNetAssetsPence,
    },
    lineCount: inPeriod.length,
    uncategorisedCount,
  };
}

export function formatStatementAmount(
  pence: StatementAmount,
  formatter: (n: number) => string,
): string {
  if (pence === null) return "—";
  return formatter(pence);
}

export type PriorStatementFigures = ReturnType<typeof priorFiguresForStatements>;

export function priorFiguresForStatements(
  c: PriorYearComparatives | null | undefined,
): {
  turnoverPence: StatementAmount;
  costOfSalesPence: StatementAmount;
  grossProfitPence: StatementAmount;
  adminExpensesPence: StatementAmount;
  profitBeforeTaxPence: StatementAmount;
  taxationPence: StatementAmount;
  profitAfterTaxPence: StatementAmount;
  dividendsPence: StatementAmount;
  retainedBroughtForwardPence: StatementAmount;
  retainedCarriedForwardPence: StatementAmount;
  balanceSheet: YearEndAccountsDraft["balanceSheet"];
} {
  const v = c ?? EMPTY_COMPARATIVES;
  const gp = priorGrossProfit(v);
  const pbt = priorProfitBeforeTax(v);
  const pat = priorProfitAfterTax(v);
  const cash = v.cashAtBankPence;
  const debtors = v.otherDebtorsPence;
  const cred = v.creditorsWithinOneYearPence;
  const netCurrent =
    cash == null && debtors == null && cred == null
      ? null
      : (debtors ?? 0) + (cash ?? 0) - (cred ?? 0);
  const total =
    v.fixedAssetsPence == null && netCurrent == null
      ? null
      : (v.fixedAssetsPence ?? 0) +
        (netCurrent ?? 0) -
        (v.creditorsAfterOneYearPence ?? 0);
  return {
    turnoverPence: v.turnoverPence,
    costOfSalesPence: v.costOfSalesPence,
    grossProfitPence: gp,
    adminExpensesPence: v.adminExpensesPence,
    profitBeforeTaxPence: pbt,
    taxationPence: v.taxationPence,
    profitAfterTaxPence: pat,
    dividendsPence: v.dividendsPence,
    retainedBroughtForwardPence: null,
    retainedCarriedForwardPence: v.profitAndLossReservePence,
    balanceSheet: {
      fixedAssetsPence: v.fixedAssetsPence,
      otherDebtorsPence: v.otherDebtorsPence ?? 0,
      cashAtBankPence: v.cashAtBankPence,
      creditorsWithinOneYearPence: v.creditorsWithinOneYearPence ?? 0,
      creditorsAfterOneYearPence: v.creditorsAfterOneYearPence,
      shareCapitalPence: v.shareCapitalPence,
      profitAndLossReservePence: v.profitAndLossReservePence,
      netCurrentAssetsPence: netCurrent,
      totalNetAssetsPence: total,
    },
  };
}

