/**
 * Year-end / Self Assessment prep pipeline for a client portfolio.
 * Stored on deskProfile.workStage with a timestamped workLog.
 */

export const CLIENT_WORK_STAGES = [
  "not_started",
  "bank_statements_received",
  "drafted",
  "in_progress",
  "completed",
  "sent_for_approval",
  "submitted",
] as const;

export type ClientWorkStage = (typeof CLIENT_WORK_STAGES)[number];

/** Which desk page should show this log line. */
export type ClientWorkDesk = "overview" | "sa" | "ct" | "vat" | "paye";

export type ClientWorkLogEntry = {
  id: string;
  at: string;
  kind: "stage" | "email" | "note" | "document" | "system";
  label: string;
  detail?: string;
  actorId?: string;
  /** Desk area — SA emails on SA page, CT on CT, etc. */
  desk?: ClientWorkDesk;
};

/** Map an outbound email `kind` onto the desk page that owns it. */
export function deskFromEmailKind(kind: string | null | undefined): ClientWorkDesk {
  const k = String(kind ?? "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    k.includes("bulk_sa") ||
    k.startsWith("sa") ||
    k.includes("sa100") ||
    k.includes("sa302") ||
    k.includes("self_assessment")
  ) {
    return "sa";
  }
  if (
    k.includes("bulk_vat") ||
    k.startsWith("vat") ||
    k.includes("vat_")
  ) {
    return "vat";
  }
  if (
    k.includes("payroll") ||
    k.includes("paye") ||
    k.includes("payslip") ||
    k.includes("fps") ||
    k.includes("eps")
  ) {
    return "paye";
  }
  if (
    k.includes("bulk_accounts") ||
    k.startsWith("ct") ||
    k.includes("accounts") ||
    k.includes("year_end") ||
    k.includes("computation") ||
    k.includes("ct600")
  ) {
    return "ct";
  }
  return "overview";
}

export function workLogMatchesDesk(
  entry: Pick<ClientWorkLogEntry, "desk" | "kind" | "label">,
  desk: ClientWorkDesk | "all",
): boolean {
  if (desk === "all") return true;
  if (entry.desk) return entry.desk === desk;
  // Legacy rows without desk: keep stage/notes on overview; infer email from label.
  if (entry.kind === "email") {
    return deskFromEmailKind(entry.label) === desk;
  }
  return desk === "overview";
}

export const WORK_STAGE_LABEL: Record<ClientWorkStage, string> = {
  not_started: "Not started",
  bank_statements_received: "Bank statements received",
  drafted: "Drafted",
  in_progress: "In progress",
  completed: "Completed",
  sent_for_approval: "Awaiting approval",
  submitted: "Submitted",
};

export const WORK_STAGE_FILTERS: Array<{
  id: ClientWorkStage | "all";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "bank_statements_received", label: "Bank statements" },
  { id: "drafted", label: "Drafted" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "sent_for_approval", label: "Awaiting approval" },
  { id: "submitted", label: "Submitted" },
];

/**
 * Self Assessment people desk — progress filters in practitioner language.
 * Maps onto stored workStage (+ SA100 filing status via mergeSaWorkStage).
 */
export type SaDeskFilter =
  | "all"
  | "info_requested"
  | "info_received"
  | "return_prepared"
  | "reviewed"
  | "submitted"
  | "complete";

export const SA_DESK_FILTERS: Array<{ id: SaDeskFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "info_requested", label: "Info requested" },
  { id: "info_received", label: "Info received" },
  { id: "return_prepared", label: "Return prepared" },
  { id: "reviewed", label: "Reviewed" },
  { id: "submitted", label: "Submitted" },
  { id: "complete", label: "Complete" },
];

export function saDeskFilterFromStage(
  stage: ClientWorkStage,
  filingStatus?: string | null,
): Exclude<SaDeskFilter, "all"> {
  if (filingStatus === "accepted") return "complete";
  if (stage === "submitted" || filingStatus === "submitted") return "submitted";
  if (stage === "completed" || stage === "sent_for_approval") return "reviewed";
  if (stage === "drafted" || stage === "in_progress") return "return_prepared";
  if (stage === "bank_statements_received") return "info_received";
  return "info_requested";
}

export function matchesSaDeskFilter(
  stage: ClientWorkStage,
  filter: SaDeskFilter,
  filingStatus?: string | null,
): boolean {
  if (filter === "all") return true;
  return saDeskFilterFromStage(stage, filingStatus) === filter;
}

export function saDeskFilterLabel(
  filter: Exclude<SaDeskFilter, "all">,
): string {
  return SA_DESK_FILTERS.find((f) => f.id === filter)?.label ?? filter;
}

export function normalizeWorkStage(
  value: string | null | undefined,
): ClientWorkStage {
  if (
    value &&
    (CLIENT_WORK_STAGES as readonly string[]).includes(value)
  ) {
    return value as ClientWorkStage;
  }
  return "not_started";
}

function stageRank(stage: ClientWorkStage): number {
  return CLIENT_WORK_STAGES.indexOf(stage);
}

/**
 * Map an SA100 return status onto the people-list pipeline.
 * Used so a saved draft shows as Drafted even if deskProfile was never bumped.
 */
export function workStageFromSaFilingStatus(
  status: string | null | undefined,
): ClientWorkStage | null {
  if (status === "draft") return "drafted";
  if (status === "submitted" || status === "accepted") return "submitted";
  return null;
}

/** Prefer the further-along of stored desk stage vs SA100-derived stage. */
export function mergeSaWorkStage(
  stored: ClientWorkStage | string | null | undefined,
  filingStatus: string | null | undefined,
): ClientWorkStage {
  const base = normalizeWorkStage(stored);
  const fromFiling = workStageFromSaFilingStatus(filingStatus);
  if (!fromFiling) return base;
  return stageRank(fromFiling) >= stageRank(base) ? fromFiling : base;
}

export function formatWorkLogWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
