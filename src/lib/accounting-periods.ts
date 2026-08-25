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
 *   AP1 — from incorporation through the day before the first anniversary
 *   AP2 — from the anniversary through the ARD (usually month-end)
 *
 * Example — incorporated 2 February 2024, ARD 28 February 2025:
 *   CH accounts:  2 Feb 2024 → 28 Feb 2025 (one pack)
 *   CT600 #1:     2 Feb 2024 → 1 Feb 2025
 *   CT600 #2:     2 Feb 2025 → 28 Feb 2025
 * Subsequent year: 1 Mar 2025 → 28 Feb 2026 (one CT600 if ≤ 12 months).
 * Both first-year CT600s are due 12 months after the CH period of account ends.
 * Tax for each AP is payable 9 months + 1 day after that AP ends.
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
  /** Companies House period of account this CT AP belongs to */
  periodOfAccountStart?: IsoDate;
  periodOfAccountEnd?: IsoDate;
  /** True for the first CH period after incorporation */
  firstYear?: boolean;
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
 * First CT accounting period ends the day before the 12-month anniversary
 * of its start. Example: 2 Feb 2024 → 1 Feb 2025.
 */
export function twelveMonthCtPeriodEnd(start: IsoDate): IsoDate | null {
  const d = parseIso(start);
  if (!d) return null;
  return toIsoDate(addDays(addYears(d, 1), -1));
}

export function addCalendarYear(iso: IsoDate, years: number): IsoDate | null {
  const d = parseIso(iso);
  if (!d) return null;
  return toIsoDate(addYears(d, years));
}

/** Advance an ARD (month-end) by N years, staying on last day of that month. */
export function advanceAccountingReferenceDate(
  ard: IsoDate,
  years: number,
): IsoDate | null {
  const d = parseIso(ard);
  if (!d) return null;
  return toIsoDate(
    lastDayOfMonth(
      new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), 15, 12)),
    ),
  );
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
  periodOfAccount: Pick<PeriodOfAccount, "start" | "end" | "firstYear">,
): CtAccountingPeriod[] {
  const twelveEnd = twelveMonthCtPeriodEnd(periodOfAccount.start);
  const poaEnd = parseIso(periodOfAccount.end);
  const splitEnd = twelveEnd ? parseIso(twelveEnd) : null;
  const poaEndIso = periodOfAccount.end;
  const firstYear = Boolean(periodOfAccount.firstYear);

  if (!poaEnd || !splitEnd) {
    return [
      buildCtAp(1, 1, periodOfAccount.start, periodOfAccount.end, poaEndIso, {
        periodOfAccountStart: periodOfAccount.start,
        periodOfAccountEnd: poaEndIso,
        firstYear,
      }),
    ];
  }

  const needsSplit = poaEnd.getTime() > splitEnd.getTime();
  if (!needsSplit) {
    return [
      buildCtAp(1, 1, periodOfAccount.start, periodOfAccount.end, poaEndIso, {
        periodOfAccountStart: periodOfAccount.start,
        periodOfAccountEnd: poaEndIso,
        firstYear,
      }),
    ];
  }

  const ap2Start = toIsoDate(addDays(splitEnd, 1));
  return [
    buildCtAp(1, 2, periodOfAccount.start, twelveEnd!, poaEndIso, {
      periodOfAccountStart: periodOfAccount.start,
      periodOfAccountEnd: poaEndIso,
      firstYear,
    }),
    buildCtAp(2, 2, ap2Start, periodOfAccount.end, poaEndIso, {
      periodOfAccountStart: periodOfAccount.start,
      periodOfAccountEnd: poaEndIso,
      firstYear,
    }),
  ];
}

/**
 * All CT600 accounting periods from incorporation through the current /
 * next open Companies House year (so every year since the company started
 * has a card).
 */
export function listCorporationTaxPeriodsSinceIncorporation(opts: {
  incorporatedOn?: string | null;
  accountsPeriodEnd?: string | null;
  lastAccountsMadeUpTo?: string | null;
  /** Include periods ending up to this many years after today (default 1). */
  yearsAhead?: number;
}): CtAccountingPeriod[] {
  const incorporated = opts.incorporatedOn?.slice(0, 10) || null;
  if (!incorporated) {
    const poa = companiesHouseAccountsPeriod(opts);
    return corporationTaxAccountingPeriods(poa);
  }

  const firstArd =
    defaultAccountingReferenceDate(incorporated) ??
    opts.accountsPeriodEnd?.slice(0, 10) ??
    null;
  if (!firstArd) {
    const poa = companiesHouseAccountsPeriod(opts);
    return corporationTaxAccountingPeriods(poa);
  }

  const yearsAhead = opts.yearsAhead ?? 0;
  const today = isoToday();
  const horizon =
    yearsAhead > 0
      ? (addCalendarYear(today, yearsAhead) ?? today)
      : today;
  // Only extend past "today" when explicitly requesting future years.
  const chNextEnd =
    yearsAhead > 0 ? opts.accountsPeriodEnd?.slice(0, 10) || null : null;
  const horizonEnd =
    chNextEnd && chNextEnd > horizon ? chNextEnd : horizon;

  const out: CtAccountingPeriod[] = [];
  let poaStart = incorporated;
  let poaEnd = firstArd;
  let firstYear = true;
  let guard = 0;

  while (guard < 40) {
    guard += 1;
    // When not requesting future years, only list completed CH years
    // (the year that has ended — not the one still in progress).
    if (yearsAhead === 0 && poaEnd >= today) break;

    const aps = corporationTaxAccountingPeriods({
      start: poaStart,
      end: poaEnd,
      firstYear,
    });
    out.push(...aps);

    if (yearsAhead > 0 && poaEnd >= horizonEnd) break;

    const nextStart = addDaysIso(poaEnd, 1);
    const nextEnd = advanceAccountingReferenceDate(poaEnd, 1);
    if (!nextStart || !nextEnd) break;
    poaStart = nextStart;
    poaEnd = nextEnd;
    firstYear = false;
  }

  return out;
}

function buildCtAp(
  index: number,
  of: number,
  start: IsoDate,
  end: IsoDate,
  periodOfAccountEnd: IsoDate,
  meta?: {
    periodOfAccountStart?: IsoDate;
    periodOfAccountEnd?: IsoDate;
    firstYear?: boolean;
  },
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
    periodOfAccountStart: meta?.periodOfAccountStart,
    periodOfAccountEnd: meta?.periodOfAccountEnd ?? periodOfAccountEnd,
    firstYear: meta?.firstYear,
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
