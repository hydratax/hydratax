import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export type FilingUrgency = "ok" | "due_soon" | "overdue" | "unknown";

const DAY_MS = 24 * 60 * 60 * 1000;
/** “Due in a month” window */
export const DUE_SOON_DAYS = 30;

/**
 * Parse CH ISO dates safely. `new Date("YYYY-MM-DD")` is UTC midnight and
 * shifts the calendar day in UK timezones — pills then show the wrong day/year.
 */
export function parseFilingIsoDate(
  iso: string | null | undefined,
): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  // Noon local avoids DST edge cases when comparing calendar days.
  return new Date(y, mo - 1, day, 12, 0, 0, 0);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function urgencyForDueDate(
  dueIso: string | null | undefined,
  now = new Date(),
): FilingUrgency {
  if (!dueIso) return "unknown";
  const due = parseFilingIsoDate(dueIso);
  if (!due) return "unknown";

  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - today) / DAY_MS);

  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

export function formatDueShort(dueIso: string | null | undefined) {
  if (!dueIso) return null;
  const d = parseFilingIsoDate(dueIso);
  if (!d) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type ClientFilingStatus = {
  confirmation: FilingUrgency;
  confirmationDue: string | null;
  accounts: FilingUrgency;
  accountsDue: string | null;
  /** Worst of CS + accounts for list highlighting */
  worst: FilingUrgency;
};

export function filingStatusFromSnapshot(
  snapshot: ClientCompaniesHouseSnapshot | null | undefined,
  now = new Date(),
): ClientFilingStatus {
  const confirmationDue = snapshot?.confirmationStatementNextDue ?? null;
  const accountsDue = snapshot?.accountsNextDue ?? null;
  const confirmation = urgencyForDueDate(confirmationDue, now);
  const accounts = urgencyForDueDate(accountsDue, now);

  const rank: Record<FilingUrgency, number> = {
    overdue: 3,
    due_soon: 2,
    ok: 1,
    unknown: 0,
  };
  const worst =
    rank[confirmation] >= rank[accounts] ? confirmation : accounts;

  return {
    confirmation,
    confirmationDue,
    accounts,
    accountsDue,
    worst,
  };
}

export type FilingFilter =
  | "all"
  | "cs_due_soon"
  | "cs_overdue"
  | "accounts_due_soon"
  | "accounts_overdue"
  | "any_due_soon"
  | "any_overdue";

export function matchesFilingFilter(
  status: ClientFilingStatus,
  filter: FilingFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "cs_due_soon":
      return status.confirmation === "due_soon";
    case "cs_overdue":
      return status.confirmation === "overdue";
    case "accounts_due_soon":
      return status.accounts === "due_soon";
    case "accounts_overdue":
      return status.accounts === "overdue";
    case "any_due_soon":
      return (
        status.confirmation === "due_soon" || status.accounts === "due_soon"
      );
    case "any_overdue":
      return (
        status.confirmation === "overdue" || status.accounts === "overdue"
      );
    default:
      return true;
  }
}

/** Calendar month offset from today: 1 = next month, 2 = month after. */
export type AccountsDueMonthWindow = "next_month" | "month_after";

function isDateInMonthOffset(
  iso: string,
  now: Date,
  monthOffset: 1 | 2,
): boolean {
  const due = parseFilingIsoDate(iso);
  if (!due) return false;
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return (
    due.getFullYear() === target.getFullYear() &&
    due.getMonth() === target.getMonth()
  );
}

export function accountsDueMonthWindow(
  dueIso: string | null | undefined,
  now = new Date(),
): AccountsDueMonthWindow | null {
  if (!dueIso) return null;
  if (isDateInMonthOffset(dueIso, now, 1)) return "next_month";
  if (isDateInMonthOffset(dueIso, now, 2)) return "month_after";
  return null;
}

export function monthWindowLabel(
  window: AccountsDueMonthWindow,
  now = new Date(),
): string {
  const offset = window === "next_month" ? 1 : 2;
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
