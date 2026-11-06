/**
 * Year-end / Self Assessment prep pipeline for a client portfolio.
 * Stored on deskProfile.workStage with a timestamped workLog.
 */

export const CLIENT_WORK_STAGES = [
  "not_started",
  "bank_statements_received",
  "in_progress",
  "completed",
  "sent_for_approval",
  "submitted",
] as const;

export type ClientWorkStage = (typeof CLIENT_WORK_STAGES)[number];

export type ClientWorkLogEntry = {
  id: string;
  at: string;
  kind: "stage" | "email" | "note" | "document" | "system";
  label: string;
  detail?: string;
  actorId?: string;
};

export const WORK_STAGE_LABEL: Record<ClientWorkStage, string> = {
  not_started: "Not started",
  bank_statements_received: "Bank statements received",
  in_progress: "Accounts in progress",
  completed: "Accounts completed",
  sent_for_approval: "Sent for client approval",
  submitted: "Submitted",
};

export const WORK_STAGE_FILTERS: Array<{
  id: ClientWorkStage | "all";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "bank_statements_received", label: "Bank statements" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "sent_for_approval", label: "Awaiting approval" },
  { id: "submitted", label: "Submitted" },
];

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
