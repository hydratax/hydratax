/**
 * Practice-facing CT600 / year-end progress for Corporation Tax desk cards.
 */

import {
  formatDueShort,
  urgencyForDueDate,
  type FilingUrgency,
} from "@/lib/filing-due";
import type { ClientWorkStage } from "@/lib/client-work-stage";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  companiesHouseAccountsPeriod,
  corporationTaxAccountingPeriods,
} from "@/lib/accounting-periods";

export type CtWorkflowStatus =
  | "not_started"
  | "drafted"
  | "ready"
  | "submitted"
  | "accepted";

export type CtClientFilter = "all" | CtWorkflowStatus;

export type CtReturnHint = {
  status?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  submittedAt?: string | Date | null;
};

export type CtClientSummary = {
  status: CtWorkflowStatus;
  periodLabel: string | null;
  dueIso: string | null;
  dueLabel: string | null;
  urgency: FilingUrgency;
  filed: boolean;
};

const RANK: Record<CtWorkflowStatus, number> = {
  not_started: 0,
  drafted: 1,
  ready: 2,
  submitted: 3,
  accepted: 4,
};

function statusFromReturn(raw: string | null | undefined): CtWorkflowStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "accepted") return "accepted";
  if (s === "submitted") return "submitted";
  if (s === "ready") return "ready";
  if (s === "draft" || s === "rejected" || s === "error") return "drafted";
  return "not_started";
}

function statusFromWorkStage(
  stage: ClientWorkStage | string | null | undefined,
): CtWorkflowStatus | null {
  const s = String(stage ?? "");
  if (s === "submitted") return "submitted";
  if (s === "completed" || s === "sent_for_approval") return "ready";
  if (s === "drafted" || s === "in_progress" || s === "bank_statements_received") {
    return "drafted";
  }
  return null;
}

export function deriveCtClientSummary(opts: {
  returns?: CtReturnHint[];
  workStage?: ClientWorkStage | string | null;
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
  now?: Date;
}): CtClientSummary {
  const now = opts.now ?? new Date();
  const snap = opts.companiesHouse ?? null;
  const returns = [...(opts.returns ?? [])].sort((a, b) =>
    String(b.periodEnd ?? "").localeCompare(String(a.periodEnd ?? "")),
  );
  const latest = returns[0] ?? null;

  let status: CtWorkflowStatus = latest
    ? statusFromReturn(latest.status)
    : "not_started";
  const fromStage = statusFromWorkStage(opts.workStage);
  if (fromStage && RANK[fromStage] > RANK[status]) status = fromStage;

  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: snap?.incorporatedOn,
    accountsPeriodEnd: snap?.accountsPeriodEnd,
    lastAccountsMadeUpTo: snap?.lastAccountsMadeUpTo,
  });
  const hasPoa = Boolean(snap?.accountsPeriodEnd || snap?.incorporatedOn);
  const aps = hasPoa ? corporationTaxAccountingPeriods(poa) : [];
  const openAp =
    aps.find((ap) => urgencyForDueDate(ap.filingDue, now) !== "ok") ??
    aps[aps.length - 1] ??
    null;

  const periodStart = latest?.periodStart
    ? String(latest.periodStart)
    : openAp?.start ?? null;
  const periodEnd = latest?.periodEnd
    ? String(latest.periodEnd)
    : openAp?.end ?? snap?.accountsPeriodEnd ?? null;
  const dueIso = openAp?.filingDue ?? null;
  const filed = status === "submitted" || status === "accepted";

  const periodLabel =
    periodStart && periodEnd
      ? `${formatDueShort(periodStart)} – ${formatDueShort(periodEnd)}`
      : periodEnd
        ? `Period to ${formatDueShort(periodEnd)}`
        : null;

  return {
    status,
    periodLabel,
    dueIso,
    dueLabel: filed
      ? status === "accepted"
        ? "Filed · accepted"
        : "Filed · submitted"
      : formatDueShort(dueIso),
    urgency: filed ? "ok" : urgencyForDueDate(dueIso, now),
    filed,
  };
}

export function matchesCtFilter(
  summary: CtClientSummary,
  filter: CtClientFilter,
): boolean {
  if (filter === "all") return true;
  return summary.status === filter;
}

export function ctStatusLabel(status: CtWorkflowStatus): string {
  switch (status) {
    case "drafted":
      return "Drafted";
    case "ready":
      return "Ready to file";
    case "submitted":
      return "Submitted";
    case "accepted":
      return "Accepted";
    default:
      return "Not started";
  }
}
