/**
 * bankbee — which calendar months in a UK tax year lack any bank lines.
 * Future months (after today) are not treated as missing.
 */

import {
  parseSaTaxYearLabel,
  saTaxYearContainingDate,
  type SaTaxYear,
} from "@/lib/sa-tax-year";

export type MissingMonthsForYear = {
  taxYear: string;
  rangeLabel: string;
  /** e.g. "Apr 2025", "May 2025" */
  missingMonths: string[];
  coveredMonths: string[];
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthKey(y: number, m0: number) {
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}

function monthLabel(y: number, m0: number) {
  return `${MONTH_SHORT[m0]} ${y}`;
}

/** Inclusive calendar months from start ISO to end ISO (yyyy-mm-dd). */
function monthsInRange(startIso: string, endIso: string): Array<{ y: number; m0: number; key: string; label: string }> {
  const [ys, ms] = startIso.split("-").map(Number);
  const [ye, me] = endIso.split("-").map(Number);
  let y = ys!;
  let m0 = (ms ?? 1) - 1;
  const endY = ye!;
  const endM0 = (me ?? 1) - 1;
  const out: Array<{ y: number; m0: number; key: string; label: string }> = [];
  while (y < endY || (y === endY && m0 <= endM0)) {
    out.push({ y, m0, key: monthKey(y, m0), label: monthLabel(y, m0) });
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      y += 1;
    }
  }
  return out;
}

function todayIso(now: Date) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * For each tax year touched by `datedIsos`, list months with no transactions
 * up to today (or the tax year end, whichever is earlier).
 */
export function missingBankMonthsByTaxYear(
  datedIsos: string[],
  now = new Date(),
): MissingMonthsForYear[] {
  const byYear = new Map<string, { year: SaTaxYear; covered: Set<string> }>();

  for (const iso of datedIsos) {
    const year = saTaxYearContainingDate(iso);
    if (!year) continue;
    const slot = byYear.get(year.label) ?? {
      year,
      covered: new Set<string>(),
    };
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    if (m) slot.covered.add(`${m[1]}-${m[2]}`);
    byYear.set(year.label, slot);
  }

  const today = todayIso(now);
  const results: MissingMonthsForYear[] = [];

  for (const { year, covered } of byYear.values()) {
    const capEnd = today < year.end ? today : year.end;
    if (capEnd < year.start) continue;
    const months = monthsInRange(year.start, capEnd);
    const missingMonths: string[] = [];
    const coveredMonths: string[] = [];
    for (const mo of months) {
      if (covered.has(mo.key)) coveredMonths.push(mo.label);
      else missingMonths.push(mo.label);
    }
    if (!missingMonths.length && !coveredMonths.length) continue;
    results.push({
      taxYear: year.label,
      rangeLabel: `${year.start} → ${year.end}`,
      missingMonths,
      coveredMonths,
    });
  }

  results.sort((a, b) => b.taxYear.localeCompare(a.taxYear));
  return results;
}

export function formatMissingMonthsSummary(
  rows: MissingMonthsForYear[],
): string {
  if (!rows.length) return "";
  return rows
    .filter((r) => r.missingMonths.length > 0)
    .map((r) => {
      const phrase = formatMissingPeriodPhrase(r);
      if (!phrase) {
        return `${r.taxYear}: missing ${r.missingMonths.join(", ")}`;
      }
      const short = phrase.replace(/^Bank statements missing /i, "");
      return `${r.taxYear}: missing ${short}`;
    })
    .join(" · ");
}

const MONTH_PARSE: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseMonthLabel(label: string): { y: number; m0: number } | null {
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/.exec(
    label.trim(),
  );
  if (!m) return null;
  const m0 = MONTH_PARSE[m[1]!];
  if (m0 == null) return null;
  return { y: Number(m[2]), m0 };
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Start side: "06 April" (long April); end side: "28 Feb 2025" (short month). */
function formatStartDay(y: number, m0: number, day: number, withYear: boolean) {
  const dd = String(day).padStart(2, "0");
  const monthWord = m0 === 3 ? "April" : (MONTH_SHORT[m0] ?? "Jan");
  return withYear ? `${dd} ${monthWord} ${y}` : `${dd} ${monthWord}`;
}

function formatEndDay(y: number, m0: number, day: number) {
  const dd = String(day).padStart(2, "0");
  return `${dd} ${MONTH_SHORT[m0] ?? "Jan"} ${y}`;
}

/**
 * e.g. "Bank statements missing from 06 April to 28 Feb 2025"
 * (year omitted on the start date when it matches the end year).
 */
export function formatMissingPeriodPhrase(
  row: MissingMonthsForYear,
): string | null {
  if (!row.missingMonths.length) return null;
  const first = parseMonthLabel(row.missingMonths[0]!);
  const last = parseMonthLabel(
    row.missingMonths[row.missingMonths.length - 1]!,
  );
  if (!first || !last) return null;

  const year = parseSaTaxYearLabel(row.taxYear);
  let startDay = 1;
  if (
    year &&
    first.y === Number(year.start.slice(0, 4)) &&
    first.m0 === 3
  ) {
    startDay = 6; // UK tax year starts 6 April
  }
  const endDay = lastDayOfMonth(last.y, last.m0);
  const startShown = formatStartDay(
    first.y,
    first.m0,
    startDay,
    first.y !== last.y,
  );
  const endShown = formatEndDay(last.y, last.m0, endDay);
  return `Bank statements missing from ${startShown} to ${endShown}`;
}

export function missingPeriodIsoBounds(
  row: MissingMonthsForYear,
): { startIso: string; endIso: string } | null {
  if (!row.missingMonths.length) return null;
  const first = parseMonthLabel(row.missingMonths[0]!);
  const last = parseMonthLabel(
    row.missingMonths[row.missingMonths.length - 1]!,
  );
  if (!first || !last) return null;
  const year = parseSaTaxYearLabel(row.taxYear);
  let startDay = 1;
  if (
    year &&
    first.y === Number(year.start.slice(0, 4)) &&
    first.m0 === 3
  ) {
    startDay = 6;
  }
  const endDay = lastDayOfMonth(last.y, last.m0);
  return {
    startIso: `${first.y}-${String(first.m0 + 1).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
    endIso: `${last.y}-${String(last.m0 + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

/**
 * Missing calendar months inside a company accounts period (periodStart→periodEnd),
 * capped at today. Used for CT / year-end bank statement chase.
 */
export function missingBankMonthsInPeriod(
  datedIsos: string[],
  periodStart: string,
  periodEnd: string,
  now = new Date(),
): MissingMonthsForYear | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return null;
  }
  const today = todayIso(now);
  const capEnd = today < periodEnd ? today : periodEnd;
  if (capEnd < periodStart) return null;

  const covered = new Set<string>();
  for (const iso of datedIsos) {
    if (iso < periodStart || iso > periodEnd) continue;
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    if (m) covered.add(`${m[1]}-${m[2]}`);
  }

  const months = monthsInRange(periodStart, capEnd);
  const missingMonths: string[] = [];
  const coveredMonths: string[] = [];
  for (const mo of months) {
    if (covered.has(mo.key)) coveredMonths.push(mo.label);
    else missingMonths.push(mo.label);
  }
  if (!missingMonths.length && !coveredMonths.length) return null;

  return {
    taxYear: `${periodStart.slice(0, 4)}–${periodEnd.slice(0, 4)}`,
    rangeLabel: `${periodStart} → ${periodEnd}`,
    missingMonths,
    coveredMonths,
  };
}

/** Phrase for an accounts period (uses period start day on the first missing month). */
export function formatMissingPeriodPhraseForAccounts(
  row: MissingMonthsForYear,
  periodStartIso: string,
): string | null {
  if (!row.missingMonths.length) return null;
  const first = parseMonthLabel(row.missingMonths[0]!);
  const last = parseMonthLabel(
    row.missingMonths[row.missingMonths.length - 1]!,
  );
  if (!first || !last) return null;
  const [psY, psM, psD] = periodStartIso.split("-").map(Number);
  let startDay = 1;
  if (
    psY === first.y &&
    (psM ?? 1) - 1 === first.m0 &&
    Number.isFinite(psD)
  ) {
    startDay = psD!;
  }
  const endDay = lastDayOfMonth(last.y, last.m0);
  const startShown = formatStartDay(
    first.y,
    first.m0,
    startDay,
    first.y !== last.y,
  );
  const endShown = formatEndDay(last.y, last.m0, endDay);
  return `Bank statements missing from ${startShown} to ${endShown}`;
}

export function missingPeriodIsoBoundsForAccounts(
  row: MissingMonthsForYear,
  periodStartIso: string,
): { startIso: string; endIso: string } | null {
  if (!row.missingMonths.length) return null;
  const first = parseMonthLabel(row.missingMonths[0]!);
  const last = parseMonthLabel(
    row.missingMonths[row.missingMonths.length - 1]!,
  );
  if (!first || !last) return null;
  const [psY, psM, psD] = periodStartIso.split("-").map(Number);
  let startDay = 1;
  if (
    psY === first.y &&
    (psM ?? 1) - 1 === first.m0 &&
    Number.isFinite(psD)
  ) {
    startDay = psD!;
  }
  const endDay = lastDayOfMonth(last.y, last.m0);
  return {
    startIso: `${first.y}-${String(first.m0 + 1).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
    endIso: `${last.y}-${String(last.m0 + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

/** Coverage for one tax year label (works with zero lines in that year). */
export function missingMonthsForTaxYearLabel(
  taxYearLabel: string,
  datedIsos: string[],
  now = new Date(),
): MissingMonthsForYear | null {
  const year = parseSaTaxYearLabel(taxYearLabel);
  if (!year) return null;
  const realInYear = datedIsos.filter((d) => {
    const y = saTaxYearContainingDate(d);
    return y?.label === taxYearLabel;
  });
  if (!realInYear.length) {
    const today = todayIso(now);
    const capEnd = today < year.end ? today : year.end;
    if (capEnd < year.start) return null;
    const months = monthsInRange(year.start, capEnd);
    return {
      taxYear: year.label,
      rangeLabel: `${year.start} → ${year.end}`,
      missingMonths: months.map((m) => m.label),
      coveredMonths: [],
    };
  }
  return (
    missingBankMonthsByTaxYear(realInYear, now).find(
      (r) => r.taxYear === taxYearLabel,
    ) ?? null
  );
}
