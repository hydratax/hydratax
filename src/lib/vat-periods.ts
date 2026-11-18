/**
 * VAT period helpers — quarterly roll-forward, HMRC-style period keys.
 *
 * UK VAT returns are normally quarterly. HMRC assigns stagger groups:
 *   Group 1: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec
 *   Group 2: Feb–Apr, May–Jul, Aug–Oct, Nov–Jan
 *   Group 3: Mar–May, Jun–Aug, Sep–Nov, Dec–Feb
 *
 * For custom periods the user picks a quarter-end month and we roll forward.
 */

export type VatPeriod = {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: "O" | "F";
};

/** Add n months to an ISO date string, returning an ISO date. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Last day of the month for a given ISO date. */
function lastDayOfMonth(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** First day of the month for a given ISO date. */
function firstDayOfMonth(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

/**
 * Generate a human-readable period key from end date.
 * Format: YYQ# e.g. "26Q1" for quarter ending Mar 2026.
 */
function periodKeyFromEnd(endIso: string): string {
  const d = new Date(`${endIso}T12:00:00Z`);
  const month = d.getUTCMonth(); // 0-indexed
  const year = d.getUTCFullYear() % 100;
  // Quarter number: month 2→Q1, 5→Q2, 8→Q3, 11→Q4 (standard calendar)
  // But for arbitrary stagger groups, use sequential numbering from the month:
  const q = Math.floor(month / 3) + 1;
  return `${String(year).padStart(2, "0")}Q${q}`;
}

/**
 * VAT due date for online returns: 1 calendar month + 7 days after period end
 * (= 7th of the second month following the period end month).
 * e.g. period ending 31 Mar → due 7 May.
 */
function dueDateFromEnd(endIso: string): string {
  const end = new Date(`${endIso}T12:00:00Z`);
  // Avoid setUTCMonth on day-31 (rolls past short months).
  const due = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 7),
  );
  return due.toISOString().slice(0, 10);
}

/**
 * Generate VAT periods from a custom quarter-end date.
 * Returns the period containing that end date plus the next `count - 1` quarters.
 */
export function generateVatPeriods(
  quarterEndIso: string,
  count: number = 5,
): VatPeriod[] {
  const periods: VatPeriod[] = [];
  // Work out the first period: 3 months ending on quarterEndIso
  const endDate = lastDayOfMonth(quarterEndIso);
  // Start is first day, 2 months before end month
  const startFirst = firstDayOfMonth(addMonths(endDate, -2));

  for (let i = 0; i < count; i++) {
    const start = addMonths(startFirst, i * 3);
    const rawEnd = addMonths(start, 2);
    const end = lastDayOfMonth(rawEnd);
    const due = dueDateFromEnd(end);
    const key = periodKeyFromEnd(end);

    periods.push({
      periodKey: key,
      start: firstDayOfMonth(start),
      end,
      due,
      status: "O",
    });
  }

  return periods;
}

/**
 * Detect which stagger group a VRN might use from a given quarter-end month.
 * Returns standard UK stagger group periods for the year surrounding the date.
 */
export function standardQuartersForMonth(
  quarterEndMonth: number,
  year: number,
  count: number = 5,
): VatPeriod[] {
  // quarterEndMonth is 1-indexed (1=Jan, 12=Dec)
  const endIso = `${year}-${String(quarterEndMonth).padStart(2, "0")}-01`;
  return generateVatPeriods(endIso, count);
}

/** Check if a date falls within a period. */
export function isInPeriod(
  dated: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  return dated >= periodStart && dated <= periodEnd;
}

/**
 * Drop periods that end before VAT registration, and clamp the first
 * overlapping period so it does not start before registration.
 */
export function clampPeriodsToRegistration<
  T extends { start: string; end: string },
>(periods: T[], vatRegistrationDate: string | null | undefined): T[] {
  const reg = vatRegistrationDate?.slice(0, 10);
  if (!reg || !/^\d{4}-\d{2}-\d{2}$/.test(reg)) return periods;

  const out: T[] = [];
  for (const period of periods) {
    if (period.end < reg) continue;
    if (period.start < reg) {
      out.push({ ...period, start: reg });
    } else {
      out.push(period);
    }
  }
  return out;
}

/** Format a period for display. */
export function formatPeriodRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * User-facing calendar quarter title from the period dates.
 * Jan–Mar → `{year} Quarter 1`, Apr–Jun → Q2, Jul–Sep → Q3, Oct–Dec → Q4.
 * Uses the period end month (after any registration clamp). Keep HMRC
 * `periodKey` for submits; only use this for desk labels.
 */
export function formatCalendarQuarterLabel(
  start: string,
  end: string,
): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(end)
    ? end
    : /^\d{4}-\d{2}-\d{2}$/.test(start)
      ? start
      : null;
  if (!iso) return end || start;
  const d = new Date(`${iso}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${year} Quarter ${quarter}`;
}

/**
 * Auto-build quarterly periods from VAT registration.
 *
 * Uses a 3-month stagger starting in the registration month (UK-style),
 * not calendar Jan–Mar… — that previously produced a one-month “Q1”
 * stub when registration fell mid calendar-quarter (e.g. 1 Mar–31 Mar).
 *
 * Example: registered 1 Mar 2025 → Mar–May, Jun–Aug, Sep–Nov, Dec–Feb.
 * Mid-month registration clamps only the first start day.
 *
 * Builds periods on month-starts so day-28/30/31 never overflow via Date.
 */
export function periodsFromRegistrationDate(
  vatRegistrationDate: string,
  count: number = 5,
): VatPeriod[] {
  const reg = vatRegistrationDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reg)) return [];

  const periods: VatPeriod[] = [];
  let monthCursor = firstDayOfMonth(reg);

  for (let i = 0; i < count; i++) {
    const end = lastDayOfMonth(addMonths(monthCursor, 2));
    const start = i === 0 ? reg : monthCursor;
    if (start <= end) {
      periods.push({
        periodKey: periodKeyFromEnd(end),
        start,
        end,
        due: dueDateFromEnd(end),
        status: "O",
      });
    }
    monthCursor = firstDayOfMonth(addMonths(monthCursor, 3));
  }

  return periods;
}

/** True when start/end are an exact calendar quarter (Jan–Mar …). */
export function isExactCalendarQuarter(start: string, end: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  ) {
    return false;
  }
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (s.getUTCDate() !== 1) return false;
  if (s.getUTCMonth() % 3 !== 0) return false;
  if (e.getUTCMonth() !== s.getUTCMonth() + 2) return false;
  if (e.getUTCFullYear() !== s.getUTCFullYear()) return false;
  return end === lastDayOfMonth(end);
}

/**
 * Desk label for a VAT period. Calendar quarters keep “YYYY Quarter N”;
 * registration staggers / stubs use “Quarter ending {Month YYYY}”.
 */
export function formatVatPeriodLabel(start: string, end: string): string {
  if (isExactCalendarQuarter(start, end)) {
    return formatCalendarQuarterLabel(start, end);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return end || start;
  const label = new Date(`${end}T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return `Quarter ending ${label}`;
}

/** Inclusive calendar-month span (Jan–Mar → 3). Minimum 1. */
export function vatPeriodMonthSpan(startIso: string, endIso: string): number {
  const s = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  const e = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  const months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) +
    1;
  return Math.max(1, months);
}

/** Build a single open VAT period from custom dates. */
export function makeVatPeriod(startIso: string, endIso: string): VatPeriod {
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  return {
    periodKey: periodKeyFromEnd(end),
    start,
    end,
    due: dueDateFromEnd(end),
    status: "O",
  };
}

/**
 * Next period after a known quarter, preserving that quarter’s month length.
 * Pass `previousStartIso` for custom staggers (e.g. 2-month or 3-month).
 * Without it, defaults to a standard 3-month roll-forward.
 */
export function nextVatPeriodAfter(
  previousEndIso: string,
  previousStartIso?: string,
): VatPeriod {
  const end = previousEndIso.slice(0, 10);
  // Anchor on the 1st so day-31 ends never overflow into the following month.
  const start = firstDayOfMonth(addMonths(firstDayOfMonth(end), 1));
  const span = previousStartIso
    ? vatPeriodMonthSpan(previousStartIso, end)
    : 3;
  const nextEnd = lastDayOfMonth(addMonths(start, span - 1));
  return makeVatPeriod(start, nextEnd);
}

/**
 * First custom quarter plus the following `count - 1` periods on the same
 * month stagger (used when the accountant sets a custom VAT quarter).
 */
export function periodsFromCustomQuarter(
  startIso: string,
  endIso: string,
  count: number = 4,
): VatPeriod[] {
  const first = makeVatPeriod(startIso, endIso);
  if (first.start > first.end) return [];
  const periods: VatPeriod[] = [first];
  for (let i = 1; i < count; i++) {
    const prev = periods[i - 1]!;
    periods.push(nextVatPeriodAfter(prev.end, prev.start));
  }
  return periods;
}

/** How many open VAT quarters the desk shows at once. */
export const VAT_PERIOD_WINDOW_SIZE = 4;

/**
 * Sliding window over periods sorted by start ascending.
 * `windowStart` is the index of the first visible period.
 */
export function sliceVatPeriodWindow<T>(
  periods: T[],
  windowStart: number,
  size: number = VAT_PERIOD_WINDOW_SIZE,
): T[] {
  if (periods.length <= size) return periods;
  const start = Math.max(0, Math.min(windowStart, periods.length - size));
  return periods.slice(start, start + size);
}

/** Index that shows the latest `size` periods (hides older ones at the top). */
export function latestVatPeriodWindowStart(
  length: number,
  size: number = VAT_PERIOD_WINDOW_SIZE,
): number {
  return Math.max(0, length - size);
}
