import {
  buildDebtorCreditorNoteTotals,
  buildNote1Schedule,
  type BankLedger,
} from "@/lib/bank-ledger";
import type {
  TrialBalanceLine,
  YearEndAccountsDraft,
} from "@/server/accounts/year-end-from-bank";

type BankLine = { category: string; amountPence: number; dated: string };

/**
 * Fold bank-ledger assets, debtors, creditors and loans into the Digitus-style
 * year-end draft (Notes 1–2 figures, BS totals, trial balance).
 */
export function enrichAccountsDraftFromLedger(
  draft: YearEndAccountsDraft,
  ledger: BankLedger,
  bankLines: BankLine[],
  opts?: { shareCapitalPence?: number },
): YearEndAccountsDraft {
  const note1 = buildNote1Schedule(
    ledger,
    draft.periodStart,
    draft.periodEnd,
  );
  const note2 = buildDebtorCreditorNoteTotals(
    ledger,
    bankLines,
    draft.periodStart,
    draft.periodEnd,
    { corporationTaxPence: draft.taxationPence },
  );

  const fixedFromLedger = note1.total.nbvCarriedForwardPence;
  const fixedAssetsPence =
    fixedFromLedger > 0
      ? fixedFromLedger
      : draft.balanceSheet.fixedAssetsPence;

  // Prefer ledger debtors; fall back to bank-query debtors already on draft.
  const otherDebtorsPence =
    note2.debtorsTotalPence > 0
      ? note2.debtorsTotalPence
      : draft.balanceSheet.otherDebtorsPence;

  const creditorsWithinOneYearPence =
    note2.creditorsWithinTotalPence > 0
      ? note2.creditorsWithinTotalPence
      : draft.balanceSheet.creditorsWithinOneYearPence;

  const loansAndMortgagesAfter =
    (draft.balanceSheet.creditorsAfterOneYearPence ?? 0) +
    note2.creditorsAfterOneYearPence;
  const creditorsAfterOneYearPence =
    loansAndMortgagesAfter > 0
      ? loansAndMortgagesAfter
      : draft.balanceSheet.creditorsAfterOneYearPence;

  // Fold ledger depreciation into Note 8 if bank didn't already capture it.
  const note8 = { ...draft.note8 };
  const extraDep = Math.max(0, note1.total.depChargePence - note8.depreciation);
  if (extraDep > 0) {
    note8.depreciation += extraDep;
  }
  const adminExpensesPence = draft.adminExpensesPence + extraDep;
  const profitBeforeTaxPence = draft.grossProfitPence - adminExpensesPence;
  const profitAfterTaxPence = profitBeforeTaxPence - draft.taxationPence;
  const retainedCarriedForwardPence =
    draft.retainedBroughtForwardPence === null
      ? draft.retainedCarriedForwardPence
      : draft.retainedBroughtForwardPence +
        profitAfterTaxPence -
        draft.dividendsPence;

  const cash = draft.balanceSheet.cashAtBankPence;
  const netCurrentAssetsPence =
    cash === null
      ? draft.balanceSheet.netCurrentAssetsPence
      : otherDebtorsPence + cash - creditorsWithinOneYearPence;

  const totalNetAssetsPence =
    fixedAssetsPence === null || netCurrentAssetsPence === null
      ? draft.balanceSheet.totalNetAssetsPence
      : fixedAssetsPence +
        netCurrentAssetsPence -
        (creditorsAfterOneYearPence ?? 0);

  const shareCapitalPence =
    opts?.shareCapitalPence ?? draft.balanceSheet.shareCapitalPence;

  const enriched: YearEndAccountsDraft = {
    ...draft,
    adminExpensesPence,
    profitBeforeTaxPence,
    profitAfterTaxPence,
    retainedCarriedForwardPence,
    note8,
    note1,
    note2,
    balanceSheet: {
      ...draft.balanceSheet,
      fixedAssetsPence,
      otherDebtorsPence,
      creditorsWithinOneYearPence,
      creditorsAfterOneYearPence,
      shareCapitalPence,
      profitAndLossReservePence: retainedCarriedForwardPence,
      netCurrentAssetsPence,
      totalNetAssetsPence,
    },
  };

  enriched.trialBalance = buildTrialBalance(enriched);
  return enriched;
}

function line(
  code: string,
  name: string,
  debitPence: number,
  creditPence: number,
): TrialBalanceLine {
  return {
    code,
    name,
    debitPence: Math.max(0, Math.round(debitPence)),
    creditPence: Math.max(0, Math.round(creditPence)),
  };
}

/** Digitus-style TB rolled from the enriched draft. */
export function buildTrialBalance(
  draft: YearEndAccountsDraft,
): TrialBalanceLine[] {
  const n8 = draft.note8;
  const n1 = draft.note1;
  const n2 = draft.note2;
  const bs = draft.balanceSheet;
  const rows: TrialBalanceLine[] = [
    line("1000", "Sales", 0, draft.turnoverPence),
    line("1210", "Domestic purchases", draft.costOfSalesPence, 0),
    line("1420", "Directors Salaries", n8.directors_remuneration, 0),
    line("1400", "Wages & Salaries", n8.salaries, 0),
    line("1431", "Accountancy Fees", n8.accountancy, 0),
    line("1432", "Legal and Professional Fees", n8.legal_professional, 0),
    line("14340", "Management & Consultancy fees", n8.consultancy, 0),
    line("1441", "Rent", n8.rent_rates, 0),
    line("1571", "Advertising", n8.advertising, 0),
    line("1517", "Bank Charges", n8.bank_charges, 0),
    line("1573", "General Insurance", n8.insurance, 0),
    line("1463", "General Travel Expenses", n8.travel, 0),
    line("1460", "Petrol and Oil", n8.fuel, 0),
    line("1577", "Telephone, Fax & Internet", n8.admin_office, 0),
    line("2500", "Interest on Loan", n8.finance, 0),
    line(
      "1576",
      "Stationery & Postage / Admin",
      n8.admin_expenses,
      0,
    ),
    line(
      "1544",
      "Depreciation Charge: Fixtures & Fittings",
      n8.depreciation,
      0,
    ),
    line(
      "4100",
      "Fixtures & Fittings - Cost",
      n1?.fixtures.costCarriedForwardPence ?? 0,
      0,
    ),
    line(
      "4080",
      "Motor Vehicles - Cost",
      n1?.motor.costCarriedForwardPence ?? 0,
      0,
    ),
    line(
      "4060",
      "Plant & Machinery - Cost",
      n1?.plant.costCarriedForwardPence ?? 0,
      0,
    ),
    line(
      "4040",
      "Freehold Premises - Cost",
      n1?.freehold.costCarriedForwardPence ?? 0,
      0,
    ),
    line(
      "4700",
      "Trade Debtors",
      n2?.debtors.trade ?? bs.otherDebtorsPence,
      0,
    ),
    line(
      "4720",
      "Called Up Share Capital Not Paid",
      n2?.debtors.unpaid_share_capital ?? 0,
      0,
    ),
    line("5220", "Cash at bank", bs.cashAtBankPence ?? 0, 0),
    line("8003", "Dividend Paid", draft.dividendsPence, 0),
    line(
      "5450",
      "Other Creditors",
      0,
      (n2?.creditorsWithin.other ?? 0) +
        (n2?.creditorsWithin.accountancy ?? 0) +
        (n2?.creditorsWithin.accruals ?? 0) +
        (n2?.creditorsWithin.trade ?? 0),
    ),
    line(
      "5430",
      "Corporation Tax",
      0,
      n2?.creditorsWithin.corporation_tax ?? draft.taxationPence,
    ),
    line("5432", "VAT", 0, n2?.creditorsWithin.vat ?? 0),
    line("5431", "PAYE & Social Security", 0, n2?.creditorsWithin.paye ?? 0),
    line(
      "7010",
      "Equity Share Capital b/fwd",
      0,
      bs.shareCapitalPence ?? 0,
    ),
    line(
      "8000",
      "Profit & Loss Account b/fwd",
      draft.retainedBroughtForwardPence != null &&
        draft.retainedBroughtForwardPence < 0
        ? -draft.retainedBroughtForwardPence
        : 0,
      draft.retainedBroughtForwardPence != null &&
        draft.retainedBroughtForwardPence > 0
        ? draft.retainedBroughtForwardPence
        : 0,
    ),
    line(
      "5510",
      "Bank Loans & Overdrafts (secured)",
      0,
      bs.creditorsAfterOneYearPence ?? 0,
    ),
  ];

  // Balancing figure: current-year profit after tax on credit (or debit if loss).
  const debitSum = rows.reduce((s, r) => s + r.debitPence, 0);
  const creditSum = rows.reduce((s, r) => s + r.creditPence, 0);
  const gap = debitSum - creditSum;
  if (gap > 0) {
    rows.push(line("9999", "Suspense / balancing (credit)", 0, gap));
  } else if (gap < 0) {
    rows.push(line("9999", "Suspense / balancing (debit)", -gap, 0));
  }

  return rows.filter((r) => r.debitPence !== 0 || r.creditPence !== 0);
}
