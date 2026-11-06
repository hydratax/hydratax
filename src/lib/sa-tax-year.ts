import {
  urgencyForDueDate,
  type FilingUrgency,
} from "@/lib/filing-due";

/**
 * UK Self Assessment tax year: 6 April → 5 April.
 * Online filing deadline for individuals: 31 January following the tax year end.
 *
 * Example: 2025–26 runs 6 Apr 2025 – 5 Apr 2026; file by 31 Jan 2027.
 */

export type SaTaxYear = {
  /** e.g. "2025-26" */
  label: string;
  /** ISO date 6 April start year */
  start: string;
  /** ISO date 5 April end year */
  end: string;
  /** ISO date 31 January after end year */
  filingDue: string;
};

export function saTaxYearFromStartYear(startYear: number): SaTaxYear {
  const endYear = startYear + 1;
  const label = `${startYear}-${String(endYear).slice(-2)}`;
  return {
    label,
    start: `${startYear}-04-06`,
    end: `${endYear}-04-05`,
    filingDue: `${endYear + 1}-01-31`,
  };
}

export function parseSaTaxYearLabel(label: string): SaTaxYear | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const startYear = Number(m[1]);
  const endShort = Number(m[2]);
  if (!Number.isFinite(startYear) || endShort !== (startYear + 1) % 100) {
    // Still accept common labels like 2025-26
    if (!Number.isFinite(startYear)) return null;
  }
  return saTaxYearFromStartYear(startYear);
}

/**
 * Tax year currently in progress (started on/after the most recent 6 April).
 */
export function currentSaTaxYear(now = new Date()): SaTaxYear {
  const y = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  // Before 6 April → still in previous tax year
  const startYear = month < 3 || (month === 3 && day < 6) ? y - 1 : y;
  return saTaxYearFromStartYear(startYear);
}

/**
 * Most recent completed tax year that individuals normally file next
 * (ended on the latest 5 April on or before today).
 */
export function filingSaTaxYear(now = new Date()): SaTaxYear {
  const current = currentSaTaxYear(now);
  // If we're still inside a tax year, the return being prepared is usually
  // the one that just ended — unless we're before the first 5 April of that year.
  const y = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  if (month < 3 || (month === 3 && day < 6)) {
    // Jan–5 Apr: filing year ended 5 Apr of previous calendar year
    return saTaxYearFromStartYear(y - 2);
  }
  // From 6 Apr: filing year is the one that ended today/this spring
  return saTaxYearFromStartYear(y - 1);
}

/** Recent tax years for the desk (newest first), including current. */
export function listSaTaxYears(count = 5, now = new Date()): SaTaxYear[] {
  const current = currentSaTaxYear(now);
  const startYear = Number(current.label.slice(0, 4));
  const years: SaTaxYear[] = [];
  for (let i = 0; i < count; i += 1) {
    years.push(saTaxYearFromStartYear(startYear - i));
  }
  return years;
}

export function saFilingUrgency(
  year: SaTaxYear,
  status: string | null | undefined,
  now = new Date(),
): FilingUrgency {
  if (status === "submitted" || status === "accepted") return "ok";
  return urgencyForDueDate(year.filingDue, now);
}

export function formatSaTaxYearRange(year: SaTaxYear): string {
  const fmt = (iso: string) => {
    const [ys, ms, ds] = iso.split("-").map(Number);
    const d = new Date(ys!, (ms ?? 1) - 1, ds ?? 1, 12);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(year.start)} → ${fmt(year.end)}`;
}

export function formatSaFilingDue(year: SaTaxYear): string {
  const [ys, ms, ds] = year.filingDue.split("-").map(Number);
  const d = new Date(ys!, (ms ?? 1) - 1, ds ?? 1, 12);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Card accent class matching company clients list. */
export function saCardUrgencyClass(
  urgency: FilingUrgency,
  submitted: boolean,
): string {
  if (submitted) return "client-card--submitted";
  if (urgency === "overdue") return "client-card--overdue";
  if (urgency === "due_soon") return "client-card--due-soon";
  return "";
}

export function saUrgencyLabel(
  urgency: FilingUrgency,
  submitted: boolean,
): string | null {
  if (submitted) return "Submitted";
  if (urgency === "overdue") return "Overdue";
  if (urgency === "due_soon") return "Due soon";
  return null;
}
