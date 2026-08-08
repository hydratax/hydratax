import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export type FilingUrgency = "ok" | "due_soon" | "overdue" | "unknown";

const DAY_MS = 24 * 60 * 60 * 1000;
/** “Due in a month” window */
export const DUE_SOON_DAYS = 30;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function urgencyForDueDate(
  dueIso: string | null | undefined,
  now = new Date(),
): FilingUrgency {
  if (!dueIso) return "unknown";
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return "unknown";

  const today = startOfDay(now);
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - today) / DAY_MS);

  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

export function formatDueShort(dueIso: string | null | undefined) {
  if (!dueIso) return null;
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return null;
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
