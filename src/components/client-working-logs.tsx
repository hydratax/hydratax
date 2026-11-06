import {
  formatWorkLogWhen,
  WORK_STAGE_LABEL,
  type ClientWorkLogEntry,
  type ClientWorkStage,
} from "@/lib/client-work-stage";

type EmailRow = {
  id: string;
  subject: string;
  toEmail: string;
  createdAt: string;
  kind: string;
};

export function ClientWorkingLogs({
  workLog,
  emails,
  stage,
}: {
  workLog: ClientWorkLogEntry[];
  emails: EmailRow[];
  stage: ClientWorkStage;
}) {
  const merged: Array<{
    id: string;
    at: string;
    label: string;
    detail?: string;
    kind: string;
  }> = [
    ...workLog.map((e) => ({
      id: e.id,
      at: e.at,
      label: e.label,
      detail: e.detail,
      kind: e.kind,
    })),
    ...emails
      .filter(
        (e) =>
          !workLog.some(
            (w) =>
              w.kind === "email" &&
              w.label.includes(e.subject) &&
              Math.abs(
                new Date(w.at).getTime() - new Date(e.createdAt).getTime(),
              ) < 60_000,
          ),
      )
      .map((e) => ({
        id: `email-${e.id}`,
        at: e.createdAt,
        label: `Email sent — ${e.subject}`,
        detail: `To ${e.toEmail}`,
        kind: "email",
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line bg-sand/60 px-4 py-3">
        <h2 className="display text-2xl text-ink">Working logs</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Current stage: {WORK_STAGE_LABEL[stage]} · {emails.length} email
          {emails.length === 1 ? "" : "s"} sent · every step timestamped
        </p>
      </div>
      {merged.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">
          No working log entries yet. Stage changes and emails appear here with
          date and time.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {merged.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{row.label}</p>
                {row.detail ? (
                  <p className="mt-0.5 text-xs text-ink-soft">{row.detail}</p>
                ) : null}
                <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-ink-soft">
                  {row.kind}
                </p>
              </div>
              <time
                dateTime={row.at}
                className="mono shrink-0 text-xs text-ink-soft"
              >
                {formatWorkLogWhen(row.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
