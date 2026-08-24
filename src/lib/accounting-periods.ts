/**
 * Companies House period of account vs HMRC Corporation Tax accounting periods.
 *
 * CH (first year): incorporation → accounting reference date (ARD).
 * ARD defaults to the last day of the month of the first anniversary
 * (Companies Act 2006 / GOV.UK “Life of a company”).
 *
 * CT600: an HMRC accounting period cannot exceed 12 months
 * (CTA 2009 s.9–12; GOV.UK “Accounting periods for Corporation Tax”).
 * If the CH period of account is longer than 12 months, file two CT600s:
 *   AP1 — from incorporation, ending 12 months after it started
 *   AP2 — the remaining days through the ARD (usually month-end)
 *
 * Example — incorporated 4 August 2025, ARD 31 August 2026:
 *   CH accounts:  4 Aug 2025 → 31 Aug 2026 (one pack)
 *   CT600 #1:     4 Aug 2025 → 4 Aug 2026  (12 months after start)
 *   CT600 #2:     5 Aug 2026 → 31 Aug 2026 (remainder to ARD)
 * Both CT600s are due 12 months after the CH period of account ends.
 * Tax for each AP is payable 9 months + 1 day after that AP ends.
 * Late CT600: typically £100 (increases if 3 months late). Missing AP2
 * is a common first-year error.
 */

export type IsoDate = string; // YYYY-MM-DD

export type PeriodOfAccount = {
  start: IsoDate;
  end: IsoDate;
  firstYear: boolean;
  accountingReferenceDate: IsoDate | null;
};

export type CtAccountingPeriod = {
  index: number;
  of: number;
  start: IsoDate;
  end: IsoDate;
  /** 12 months after the Companies House period of account ends */
  filingDue: IsoDate;
  /** 9 months + 1 day after this AP ends */
  paymentDue: IsoDate;
  days: number;
  label: string;
};

function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + years);
  return x;
}

function lastDayOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
}

export function daysInclusive(start: IsoDate, end: IsoDate): number {
  const a = parseIso(start);
  const b = parseIso(end);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Last day of the month of the first anniversary of incorporation. */
export function defaultAccountingReferenceDate(
  incorporatedOn: IsoDate,
): IsoDate | null {
  const d = parseIso(incorporatedOn);
  if (!d) return null;
  return toIsoDate(lastDayOfMonth(addYears(d, 1)));
}

/**
 * First CT accounting period ends 12 months after it started
 * (GOV.UK: earlier of 12 months after start, or accounts made-up date).
 * 4 Aug 2025 → 4 Aug 2026.
 */
export function twelveMonthCtPeriodEnd(start: IsoDate): IsoDate | null {
  const d = parseIso(start);
  if (!d) return null;
  return toIsoDate(addYears(d, 1));
}

export function addCalendarYear(iso: IsoDate, years: number): IsoDate | null {
  const d = parseIso(iso);
  if (!d) return null;
  return toIsoDate(addYears(d, years));
}

export function companiesHouseAccountsPeriod(opts: {
  incorporatedOn?: string | null;
  accountsPeriodEnd?: string | null;
  lastAccountsMadeUpTo?: string | null;
}): PeriodOfAccount {
  const incorporated = opts.incorporatedOn?.slice(0, 10) || null;
  const nextEnd = opts.accountsPeriodEnd?.slice(0, 10) || null;
  const lastMadeUp = opts.lastAccountsMadeUpTo?.slice(0, 10) || null;
  const ard =
    nextEnd ??
    (incorporated ? defaultAccountingReferenceDate(incorporated) : null);
  const spanFromIncorporation =
    incorporated && ard ? daysInclusive(incorporated, ard) : 0;
  const firstYear =
    !lastMadeUp &&
    Boolean(incorporated) &&
    (spanFromIncorporation === 0 || spanFromIncorporation <= 550);

  if (firstYear) {
    const start = incorporated ?? (ard ? shiftStartFromEnd(ard) : isoToday());
    const end = ard ?? start;
    return {
      start,
      end,
      firstYear: true,
      accountingReferenceDate: ard,
    };
  }

  if (!ard && !lastMadeUp) {
    const today = isoToday();
    return {
      start: today,
      end: today,
      firstYear: false,
      accountingReferenceDate: null,
    };
  }

  const end = ard ?? lastMadeUp!;
  const start = addDaysIso(lastMadeUp, 1) ?? shiftStartFromEnd(end);
  return {
    start,
    end,
    firstYear: false,
    accountingReferenceDate: ard,
  };
}

function isoToday(): IsoDate {
  return toIsoDate(new Date());
}

function shiftStartFromEnd(end: IsoDate): IsoDate {
  const d = parseIso(end);
  if (!d) return end;
  return toIsoDate(addDays(addYears(d, -1), 1));
}

function addDaysIso(iso: string | null, days: number): IsoDate | null {
  if (!iso) return null;
  const d = parseIso(iso);
  if (!d) return null;
  return toIsoDate(addDays(d, days));
}

export function corporationTaxAccountingPeriods(
  periodOfAccount: Pick<PeriodOfAccount, "start" | "end">,
): CtAccountingPeriod[] {
  const twelveEnd = twelveMonthCtPeriodEnd(periodOfAccount.start);
  const poaEnd = parseIso(periodOfAccount.end);
  const splitEnd = twelveEnd ? parseIso(twelveEnd) : null;
  const poaEndIso = periodOfAccount.end;
  if (!poaEnd || !splitEnd) {
    return [buildCtAp(1, 1, periodOfAccount.start, periodOfAccount.end, poaEndIso)];
  }

  const needsSplit = poaEnd.getTime() > splitEnd.getTime();
  if (!needsSplit) {
    return [buildCtAp(1, 1, periodOfAccount.start, periodOfAccount.end, poaEndIso)];
  }

  const ap2Start = toIsoDate(addDays(splitEnd, 1));
  return [
    buildCtAp(1, 2, periodOfAccount.start, twelveEnd!, poaEndIso),
    buildCtAp(2, 2, ap2Start, periodOfAccount.end, poaEndIso),
  ];
}

function buildCtAp(
  index: number,
  of: number,
  start: IsoDate,
  end: IsoDate,
  periodOfAccountEnd: IsoDate,
): CtAccountingPeriod {
  const days = daysInclusive(start, end);

  return {
    index,
    of,
    start,
    end,
    filingDue: addCalendarYear(periodOfAccountEnd, 1) ?? periodOfAccountEnd,
    paymentDue: paymentDueFromPeriodEnd(end),
    days,
    label:
      of === 1
        ? `CT600 ${formatShort(start)} – ${formatShort(end)}`
        : `CT600 ${index} of ${of} · ${formatShort(start)} – ${formatShort(end)}`,
  };
}

/** Corporation Tax payment: 9 months and 1 day after AP end. */
export function paymentDueFromPeriodEnd(end: IsoDate): IsoDate {
  const d = parseIso(end);
  if (!d) return end;
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + 9);
  x.setUTCDate(x.getUTCDate() + 1);
  return toIsoDate(x);
}

function formatShort(iso: IsoDate): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatGbDate(iso: IsoDate | null | undefined): string {
  if (!iso) return "—";
  const d = parseIso(iso.slice(0, 10));
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type PriorYearComparatives = {
  turnoverPence: number | null;
  costOfSalesPence: number | null;
  adminExpensesPence: number | null;
  taxationPence: number | null;
  dividendsPence: number | null;
  fixedAssetsPence: number | null;
  otherDebtorsPence: number | null;
  cashAtBankPence: number | null;
  creditorsWithinOneYearPence: number | null;
  creditorsAfterOneYearPence: number | null;
  shareCapitalPence: number | null;
  profitAndLossReservePence: number | null;
};

export const EMPTY_COMPARATIVES: PriorYearComparatives = {
  turnoverPence: null,
  costOfSalesPence: null,
  adminExpensesPence: null,
  taxationPence: null,
  dividendsPence: null,
  fixedAssetsPence: null,
  otherDebtorsPence: null,
  cashAtBankPence: null,
  creditorsWithinOneYearPence: null,
  creditorsAfterOneYearPence: null,
  shareCapitalPence: null,
  profitAndLossReservePence: null,
};

export function priorGrossProfit(c: PriorYearComparatives): number | null {
  if (c.turnoverPence == null && c.costOfSalesPence == null) return null;
  return (c.turnoverPence ?? 0) - (c.costOfSalesPence ?? 0);
}

export function priorProfitBeforeTax(c: PriorYearComparatives): number | null {
  const gp = priorGrossProfit(c);
  if (gp == null && c.adminExpensesPence == null) return null;
  return (gp ?? 0) - (c.adminExpensesPence ?? 0);
}

export function priorProfitAfterTax(c: PriorYearComparatives): number | null {
  const pbt = priorProfitBeforeTax(c);
  if (pbt == null && c.taxationPence == null) return null;
  return (pbt ?? 0) - (c.taxationPence ?? 0);
}

export function parseComparatives(raw: unknown): PriorYearComparatives {
  if (!raw || typeof raw !== "object") return { ...EMPTY_COMPARATIVES };
  const o = raw as Record<string, unknown>;
  const n = (k: keyof PriorYearComparatives): number | null => {
    const v = o[k];
    if (v == null || v === "") return null;
    const num = typeof v === "number" ? v : Number(v);
    return Number.isFinite(num) ? Math.round(num) : null;
  };
  return {
    turnoverPence: n("turnoverPence"),
    costOfSalesPence: n("costOfSalesPence"),
    adminExpensesPence: n("adminExpensesPence"),
    taxationPence: n("taxationPence"),
    dividendsPence: n("dividendsPence"),
    fixedAssetsPence: n("fixedAssetsPence"),
    otherDebtorsPence: n("otherDebtorsPence"),
    cashAtBankPence: n("cashAtBankPence"),
    creditorsWithinOneYearPence: n("creditorsWithinOneYearPence"),
    creditorsAfterOneYearPence: n("creditorsAfterOneYearPence"),
    shareCapitalPence: n("shareCapitalPence"),
    profitAndLossReservePence: n("profitAndLossReservePence"),
  };
}

