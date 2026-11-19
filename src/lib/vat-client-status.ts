/**
 * Practice-facing VAT workflow status for VAT desk cards / filters.
 * Desk language only — maps return rows + portal/work log to progress chips.
 */

import { formatDueShort } from "@/lib/filing-due";
import type { ClientWorkStage } from "@/lib/client-work-stage";
import { deskFromEmailKind } from "@/lib/client-work-stage";

export type VatWorkflowStatus =
  | "drafted"
  | "emailed"
  | "completed"
  | "submitted"
  | "approved";

export type VatClientFilter = "all" | VatWorkflowStatus;

export type VatReturnHint = {
  status?: string | null;
  periodKey?: string | null;
  periodEnd?: string | null;
  submittedAt?: string | Date | null;
};

export type VatPortalHint = {
  approveVat?: boolean;
  approvalPacks?: { vat?: { sentAt?: string } };
};

export type VatWorkLogHint = {
  kind?: string;
  label?: string;
  desk?: string;
};

export type VatClientSummary = {
  status: VatWorkflowStatus | "not_started";
  nextDueIso: string | null;
  nextDueLabel: string | null;
  periodLabel: string | null;
};

const RANK: Record<VatWorkflowStatus | "not_started", number> = {
  not_started: 0,
  drafted: 1,
  completed: 2,
  emailed: 3,
  submitted: 4,
  approved: 5,
};

function isoDate(year: number, month: number, day: number) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Next standard VAT stagger: 1 month and 7 days after Mar/Jun/Sep/Dec. */
export function estimateNextVatDueIso(now = new Date()): string {
  const periodEndMonths = [2, 5, 8, 11];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year++) {
    for (const endMonth of periodEndMonths) {
      const due = new Date(year, endMonth + 2, 7);
      if (due >= today) {
        return isoDate(due.getFullYear(), due.getMonth() + 1, due.getDate());
      }
    }
  }
  return isoDate(now.getFullYear() + 1, 5, 7);
}

function normalizeReturnStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function statusFromReturn(status: string): VatWorkflowStatus | "not_started" | null {
  if (status === "accepted" || status === "submitted") return "submitted";
  if (status === "ready") return "completed";
  if (status === "draft") return "drafted";
  return null;
}

function hasVatEmail(workLog: VatWorkLogHint[] | null | undefined): boolean {
  if (!workLog?.length) return false;
  return workLog.some((entry) => {
    if (entry.desk === "vat") return entry.kind === "email";
    if (entry.kind === "email") {
      return deskFromEmailKind(entry.label) === "vat";
    }
    return false;
  });
}

/**
 * Prefer the furthest-along of return status, work stage, portal approval,
 * and emailed signals.
 */
export function deriveVatClientSummary(opts: {
  returns?: VatReturnHint[];
  workStage?: ClientWorkStage | string | null;
  workLog?: VatWorkLogHint[] | null;
  portal?: VatPortalHint | null;
  now?: Date;
}): VatClientSummary {
  const now = opts.now ?? new Date();
  const returns = [...(opts.returns ?? [])].sort((a, b) => {
    const ae = String(a.periodEnd ?? a.periodKey ?? "");
    const be = String(b.periodEnd ?? b.periodKey ?? "");
    return be.localeCompare(ae);
  });
  const latest = returns[0] ?? null;

  let status: VatWorkflowStatus | "not_started" = "not_started";
  const bump = (next: VatWorkflowStatus | "not_started") => {
    if (RANK[next] > RANK[status]) status = next;
  };

  if (latest) {
    const fromReturn = statusFromReturn(normalizeReturnStatus(latest.status));
    if (fromReturn) bump(fromReturn);
  }

  const stage = String(opts.workStage ?? "");
  if (stage === "drafted" || stage === "in_progress") bump("drafted");
  if (stage === "completed") bump("completed");
  if (stage === "sent_for_approval") bump("emailed");
  if (stage === "submitted") bump("submitted");

  if (opts.portal?.approvalPacks?.vat?.sentAt || hasVatEmail(opts.workLog)) {
    bump("emailed");
  }
  if (opts.portal?.approveVat) bump("approved");

  const nextDueIso = estimateNextVatDueIso(now);
  const periodEnd = latest?.periodEnd ? String(latest.periodEnd) : null;

  return {
    status,
    nextDueIso,
    nextDueLabel: formatDueShort(nextDueIso),
    periodLabel: periodEnd
      ? `Period to ${formatDueShort(periodEnd)}`
      : "Next quarter",
  };
}

export function matchesVatFilter(
  summary: VatClientSummary,
  filter: VatClientFilter,
): boolean {
  if (filter === "all") return true;
  return summary.status === filter;
}

export function vatStatusLabel(
  status: VatWorkflowStatus | "not_started",
): string {
  switch (status) {
    case "drafted":
      return "Drafted";
    case "emailed":
      return "Emailed to client";
    case "completed":
      return "Completed";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    default:
      return "Not started";
  }
}
