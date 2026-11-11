/** Client bank year-end ledger: loans, assets, properties, debtors & creditors. */

export type LoanAccountKind = "director" | "bank" | "hp" | "other";

/** Digitus Note 2 debtor buckets. */
export type DebtorBucket =
  | "trade"
  | "vat"
  | "paye"
  | "tax"
  | "unpaid_share_capital"
  | "other";

/** Digitus Note 2 / 3 creditor buckets (within one year unless after_one_year). */
export type CreditorBucket =
  | "trade"
  | "corporation_tax"
  | "accountancy"
  | "accruals"
  | "vat"
  | "paye"
  | "bank_overdraft"
  | "other"
  | "after_one_year";

export type DebtorAccount = {
  id: string;
  name: string;
  bucket: DebtorBucket;
  broughtForwardPence: number;
  /** Invoices / amounts raised in the period (manual). */
  invoicesPence: number;
  /**
   * Receipts from bank linked to this debtor (pence, absolute).
   * When null, roll from bankCategory inflows.
   */
  receiptsPence: number | null;
  bankCategory?: string | null;
  /** Manual closing override — when set, skips BF + invoices − receipts. */
  closingOverridePence: number | null;
  notes?: string;
  createdAt: string;
};

export type CreditorAccount = {
  id: string;
  name: string;
  bucket: CreditorBucket;
  broughtForwardPence: number;
  /** Bills / accruals raised in the period (manual). */
  billsPence: number;
  /**
   * Payments from bank linked to this creditor (pence, absolute).
   * When null, roll from bankCategory outflows.
   */
  paymentsPence: number | null;
  bankCategory?: string | null;
  closingOverridePence: number | null;
  notes?: string;
  createdAt: string;
};

export type LoanAccount = {
  id: string;
  name: string;
  kind: LoanAccountKind;
  /** Opening / brought-forward balance (liability, pence). */
  broughtForwardPence: number;
  /** Optional link: bank category id used for capital repayments. */
  repaymentCategory?: string | null;
  /** Optional link: bank category for new advances. */
  advanceCategory?: string | null;
  notes?: string;
  createdAt: string;
};

export type DepreciationMethod = "reducing_balance" | "straight_line";

export type TangibleAsset = {
  id: string;
  name: string;
  /** vehicle | plant | fixtures | other */
  class: "vehicle" | "plant" | "fixtures" | "other";
  acquiredOn: string;
  costPence: number;
  /** NBV at start of current period (pence). */
  broughtForwardNbvPence: number;
  method: DepreciationMethod;
  /** Annual rate e.g. 25 for 25%. */
  ratePercent: number;
  residualPence?: number;
  notes?: string;
  createdAt: string;
};

export type PropertyMortgage = {
  id: string;
  lender: string;
  broughtForwardPence: number;
  /** Interest charged / due for the period (accrual), pence. */
  interestDuePence: number;
  /**
   * Interest actually paid from bank in the period (pence).
   * When null, roll from linked bank category if set.
   */
  interestPaidPence: number | null;
  /** Bank category that captures mortgage interest payments. */
  interestPaidCategory?: string | null;
  /** Bank category for capital repayments. */
  capitalCategory?: string | null;
  notes?: string;
};

export type PropertyAsset = {
  id: string;
  name: string;
  address?: string;
  acquiredOn?: string;
  costPence: number;
  mortgages: PropertyMortgage[];
  notes?: string;
  createdAt: string;
};

/** CT capital allowances claim for the accounting period (pence). */
export type CapitalAllowancesClaim = {
  /** Annual Investment Allowance claimed on qualifying additions. */
  aiaClaimPence: number;
  /** Writing-down allowance — main pool (typically 18%). */
  mainPoolWdaPence: number;
  /** Writing-down allowance — special rate pool (typically 6%). */
  specialRateWdaPence: number;
  /** Optional first-year / other allowances. */
  otherAllowancesPence: number;
  notes?: string;
};

export type BankLedger = {
  periodStart: string | null;
  periodEnd: string | null;
  loans: LoanAccount[];
  assets: TangibleAsset[];
  properties: PropertyAsset[];
  debtors: DebtorAccount[];
  creditors: CreditorAccount[];
  /** Corporation tax capital allowances for the period. */
  capitalAllowances?: CapitalAllowancesClaim;
  /** Unpaid called-up share capital (debtor) — Digitus Note 2 line. */
  unpaidShareCapitalPence?: number;
  /** Snapshot of closing balances from last year (for bring-forward). */
  priorClosing?: {
    periodEnd: string;
    loans: Array<{ id: string; name: string; kind: LoanAccountKind; closingPence: number }>;
    assets: Array<{
      id: string;
      name: string;
      class: TangibleAsset["class"];
      closingNbvPence: number;
      costPence: number;
      method: DepreciationMethod;
      ratePercent: number;
    }>;
    properties: Array<{
      id: string;
      name: string;
      costPence: number;
      mortgages: Array<{ id: string; lender: string; closingPence: number }>;
    }>;
    debtors?: Array<{
      id: string;
      name: string;
      bucket: DebtorBucket;
      closingPence: number;
    }>;
    creditors?: Array<{
      id: string;
      name: string;
      bucket: CreditorBucket;
      closingPence: number;
    }>;
  } | null;
  updatedAt?: string;
};

export function emptyBankLedger(): BankLedger {
  return {
    periodStart: null,
    periodEnd: null,
    loans: [],
    assets: [],
    properties: [],
    debtors: [],
    creditors: [],
    unpaidShareCapitalPence: 0,
    priorClosing: null,
  };
}

export const DEBTOR_BUCKET_LABELS: Record<DebtorBucket, string> = {
  trade: "Trade Debtors",
  vat: "VAT",
  paye: "PAYE",
  tax: "Tax Debtors",
  unpaid_share_capital: "Unpaid Share Capital",
  other: "Other Debtors",
};

export const CREDITOR_BUCKET_LABELS: Record<CreditorBucket, string> = {
  trade: "Trade Creditors",
  corporation_tax: "Corporation Tax",
  accountancy: "Accountancy",
  accruals: "Accruals",
  vat: "VAT",
  paye: "PAYE",
  bank_overdraft: "Bank Overdraft",
  other: "Other Creditors",
  after_one_year: "Bank Loan (after one year)",
};

export function debtorClosingPence(
  d: DebtorAccount,
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  periodStart: string,
  periodEnd: string,
): number {
  if (d.closingOverridePence != null) return Math.max(0, d.closingOverridePence);
  const receipts =
    d.receiptsPence != null
      ? Math.max(0, d.receiptsPence)
      : categoryInflowPence(lines, d.bankCategory, periodStart, periodEnd);
  return Math.max(
    0,
    d.broughtForwardPence + Math.max(0, d.invoicesPence) - receipts,
  );
}

export function creditorClosingPence(
  c: CreditorAccount,
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  periodStart: string,
  periodEnd: string,
): number {
  if (c.closingOverridePence != null) return Math.max(0, c.closingOverridePence);
  const payments =
    c.paymentsPence != null
      ? Math.max(0, c.paymentsPence)
      : categoryOutflowPence(lines, c.bankCategory, periodStart, periodEnd);
  return Math.max(
    0,
    c.broughtForwardPence + Math.max(0, c.billsPence) - payments,
  );
}

export type FixedAssetClassKey =
  | "fixtures"
  | "motor"
  | "plant"
  | "freehold";

export type Note1AssetColumn = {
  costBroughtForwardPence: number;
  additionsPence: number;
  disposalsPence: number;
  costCarriedForwardPence: number;
  depBroughtForwardPence: number;
  depChargePence: number;
  depOnDisposalsPence: number;
  depCarriedForwardPence: number;
  nbvBroughtForwardPence: number;
  nbvCarriedForwardPence: number;
};

export type Note1Schedule = Record<FixedAssetClassKey, Note1AssetColumn> & {
  total: Note1AssetColumn;
};

function emptyNote1Col(): Note1AssetColumn {
  return {
    costBroughtForwardPence: 0,
    additionsPence: 0,
    disposalsPence: 0,
    costCarriedForwardPence: 0,
    depBroughtForwardPence: 0,
    depChargePence: 0,
    depOnDisposalsPence: 0,
    depCarriedForwardPence: 0,
    nbvBroughtForwardPence: 0,
    nbvCarriedForwardPence: 0,
  };
}

function mapAssetClass(c: TangibleAsset["class"]): FixedAssetClassKey {
  if (c === "vehicle") return "motor";
  if (c === "plant") return "plant";
  return "fixtures";
}

/** Digitus Note 1 tangible assets schedule from ledger assets + properties. */
export function buildNote1Schedule(
  ledger: BankLedger,
  periodStart: string,
  periodEnd: string,
): Note1Schedule {
  const cols: Record<FixedAssetClassKey, Note1AssetColumn> = {
    fixtures: emptyNote1Col(),
    motor: emptyNote1Col(),
    plant: emptyNote1Col(),
    freehold: emptyNote1Col(),
  };

  for (const a of ledger.assets) {
    const key = mapAssetClass(a.class);
    const charge = depreciationChargePence(a, periodStart, periodEnd);
    const nbvOpen =
      a.broughtForwardNbvPence > 0 ? a.broughtForwardNbvPence : a.costPence;
    const acquiredInPeriod =
      /^\d{4}-\d{2}-\d{2}$/.test(a.acquiredOn) &&
      a.acquiredOn >= periodStart &&
      a.acquiredOn <= periodEnd;
    const costBf = acquiredInPeriod ? 0 : a.costPence;
    const additions = acquiredInPeriod ? a.costPence : 0;
    // Mid-year additions: dep BF and cost BF are 0.
    const depBrought = acquiredInPeriod ? 0 : Math.max(0, a.costPence - nbvOpen);

    cols[key].costBroughtForwardPence += costBf;
    cols[key].additionsPence += additions;
    cols[key].costCarriedForwardPence += a.costPence;
    cols[key].depBroughtForwardPence += depBrought;
    cols[key].depChargePence += charge;
    cols[key].depCarriedForwardPence += depBrought + charge;
    cols[key].nbvBroughtForwardPence += acquiredInPeriod ? 0 : nbvOpen;
    cols[key].nbvCarriedForwardPence += assetClosingNbvPence(
      a,
      periodStart,
      periodEnd,
    );
  }

  for (const p of ledger.properties) {
    cols.freehold.costBroughtForwardPence += p.costPence;
    cols.freehold.costCarriedForwardPence += p.costPence;
    cols.freehold.nbvBroughtForwardPence += p.costPence;
    cols.freehold.nbvCarriedForwardPence += p.costPence;
  }

  const total = emptyNote1Col();
  for (const key of Object.keys(cols) as FixedAssetClassKey[]) {
    const c = cols[key];
    total.costBroughtForwardPence += c.costBroughtForwardPence;
    total.additionsPence += c.additionsPence;
    total.disposalsPence += c.disposalsPence;
    total.costCarriedForwardPence += c.costCarriedForwardPence;
    total.depBroughtForwardPence += c.depBroughtForwardPence;
    total.depChargePence += c.depChargePence;
    total.depOnDisposalsPence += c.depOnDisposalsPence;
    total.depCarriedForwardPence += c.depCarriedForwardPence;
    total.nbvBroughtForwardPence += c.nbvBroughtForwardPence;
    total.nbvCarriedForwardPence += c.nbvCarriedForwardPence;
  }

  return { ...cols, total };
}

export type DebtorCreditorNoteTotals = {
  debtors: Record<DebtorBucket, number>;
  creditorsWithin: Record<Exclude<CreditorBucket, "after_one_year">, number>;
  creditorsAfterOneYearPence: number;
  debtorsTotalPence: number;
  creditorsWithinTotalPence: number;
};

export function buildDebtorCreditorNoteTotals(
  ledger: BankLedger,
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  periodStart: string,
  periodEnd: string,
  opts?: { corporationTaxPence?: number },
): DebtorCreditorNoteTotals {
  const debtors: Record<DebtorBucket, number> = {
    trade: 0,
    vat: 0,
    paye: 0,
    tax: 0,
    unpaid_share_capital: ledger.unpaidShareCapitalPence ?? 0,
    other: 0,
  };
  const creditorsWithin: Record<
    Exclude<CreditorBucket, "after_one_year">,
    number
  > = {
    trade: 0,
    corporation_tax: 0,
    accountancy: 0,
    accruals: 0,
    vat: 0,
    paye: 0,
    bank_overdraft: 0,
    other: 0,
  };
  let creditorsAfterOneYearPence = 0;

  for (const d of ledger.debtors) {
    debtors[d.bucket] += debtorClosingPence(d, lines, periodStart, periodEnd);
  }
  for (const c of ledger.creditors) {
    const closing = creditorClosingPence(c, lines, periodStart, periodEnd);
    if (c.bucket === "after_one_year") {
      creditorsAfterOneYearPence += closing;
    } else {
      creditorsWithin[c.bucket] += closing;
    }
  }

  const hasCtCreditor = ledger.creditors.some(
    (c) => c.bucket === "corporation_tax",
  );
  if (!hasCtCreditor && opts?.corporationTaxPence) {
    creditorsWithin.corporation_tax = opts.corporationTaxPence;
  }

  const debtorsTotalPence = Object.values(debtors).reduce((s, v) => s + v, 0);
  const creditorsWithinTotalPence = Object.values(creditorsWithin).reduce(
    (s, v) => s + v,
    0,
  );

  return {
    debtors,
    creditorsWithin,
    creditorsAfterOneYearPence,
    debtorsTotalPence,
    creditorsWithinTotalPence,
  };
}

export function depreciationChargePence(
  asset: TangibleAsset,
  periodStart: string,
  periodEnd: string,
): number {
  if (asset.broughtForwardNbvPence <= 0 && asset.costPence <= 0) return 0;
  const start = asset.broughtForwardNbvPence > 0
    ? asset.broughtForwardNbvPence
    : asset.costPence;
  const residual = Math.max(0, asset.residualPence ?? 0);
  const base = Math.max(0, start - residual);
  if (base <= 0) return 0;

  const rate = Math.max(0, Math.min(100, asset.ratePercent)) / 100;
  let fullYear = 0;
  if (asset.method === "straight_line") {
    const costBase = Math.max(0, asset.costPence - residual);
    fullYear = Math.round(costBase * rate);
  } else {
    fullYear = Math.round(base * rate);
  }

  // Time-apportion if asset acquired mid-period.
  const acquired = asset.acquiredOn;
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(acquired) &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) &&
    acquired > periodStart &&
    acquired <= periodEnd
  ) {
    const totalDays =
      (Date.parse(`${periodEnd}T12:00:00Z`) -
        Date.parse(`${periodStart}T12:00:00Z`)) /
        86_400_000 +
      1;
    const heldDays =
      (Date.parse(`${periodEnd}T12:00:00Z`) -
        Date.parse(`${acquired}T12:00:00Z`)) /
        86_400_000 +
      1;
    if (totalDays > 0 && heldDays < totalDays) {
      return Math.min(base, Math.round((fullYear * heldDays) / totalDays));
    }
  }
  if (acquired > periodEnd) return 0;
  return Math.min(base, fullYear);
}

export function assetClosingNbvPence(
  asset: TangibleAsset,
  periodStart: string,
  periodEnd: string,
): number {
  const open =
    asset.broughtForwardNbvPence > 0 ? asset.broughtForwardNbvPence : asset.costPence;
  return Math.max(
    0,
    open - depreciationChargePence(asset, periodStart, periodEnd),
  );
}

export function sumBankCategoryPence(
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  category: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): number {
  if (!category) return 0;
  let sum = 0;
  for (const line of lines) {
    if (line.category !== category) continue;
    if (line.dated < periodStart || line.dated > periodEnd) continue;
    // Outflows are negative; interest paid is absolute spend.
    sum += line.amountPence;
  }
  return sum;
}

/** Absolute money out for a category (positive pence). */
export function categoryOutflowPence(
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  category: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): number {
  const n = sumBankCategoryPence(lines, category, periodStart, periodEnd);
  return n < 0 ? -n : 0;
}

export function categoryInflowPence(
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  category: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): number {
  const n = sumBankCategoryPence(lines, category, periodStart, periodEnd);
  return n > 0 ? n : 0;
}

export function loanClosingPence(
  loan: LoanAccount,
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  periodStart: string,
  periodEnd: string,
): number {
  const repaid = categoryOutflowPence(
    lines,
    loan.repaymentCategory,
    periodStart,
    periodEnd,
  );
  const advanced = categoryInflowPence(
    lines,
    loan.advanceCategory,
    periodStart,
    periodEnd,
  );
  return loan.broughtForwardPence + advanced - repaid;
}

export function mortgageInterestPaidPence(
  m: PropertyMortgage,
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  periodStart: string,
  periodEnd: string,
): number {
  if (m.interestPaidPence != null) return Math.max(0, m.interestPaidPence);
  return categoryOutflowPence(
    lines,
    m.interestPaidCategory ?? "finance",
    periodStart,
    periodEnd,
  );
}

export type LivePlSummary = {
  turnoverPence: number;
  costOfSalesPence: number;
  grossProfitPence: number;
  expensesPence: number;
  depreciationPence: number;
  financeCostsPence: number;
  mortgageInterestPaidPence: number;
  mortgageInterestDuePence: number;
  profitBeforeTaxPence: number;
  fixedAssetsNbvPence: number;
  propertyCostPence: number;
  loansClosingPence: number;
  mortgagesClosingPence: number;
  lineCount: number;
  uncategorisedCount: number;
};
