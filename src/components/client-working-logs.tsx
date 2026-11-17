import {
  deskFromEmailKind,
  formatWorkLogWhen,
  workLogMatchesDesk,
  WORK_STAGE_LABEL,
  type ClientWorkDesk,
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

const DESK_TITLE: Record<ClientWorkDesk | "all", string> = {
  all: "Worklogs",
  overview: "Worklogs",
  sa: "Self Assessment worklogs",
  ct: "Corporation Tax worklogs",
  vat: "VAT worklogs",
  paye: "PAYE worklogs",
};

/**
 * Closed dropdown of every interaction for this client on this desk.
 * Bulk emails are included when they were sent to this client.
 */
export function ClientWorkingLogs({
  workLog,
  emails,
  stage,
  desk = "all",
  defaultOpen = false,
}: {
  workLog: ClientWorkLogEntry[];
  emails: EmailRow[];
  stage?: ClientWorkStage;
  /** Filter to one desk area; overview/all show everything relevant. */
  desk?: ClientWorkDesk | "all";
  defaultOpen?: boolean;
}) {
  const scopedLog = workLog.filter((e) => workLogMatchesDesk(e, desk));
  const scopedEmails =
    desk === "all"
      ? emails
      : emails.filter((e) => deskFromEmailKind(e.kind) === desk);

  const merged: Array<{
    id: string;
    at: string;
    label: string;
    detail?: string;
    kind: string;
  }> = [
    ...scopedLog.map((e) => ({
      id: e.id,
      at: e.at,
      label: e.label,
      detail: e.detail,
      kind: e.kind,
    })),
    ...scopedEmails
      .filter(
        (e) =>
          !scopedLog.some(
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
        detail: `To ${e.toEmail}${
          e.kind.toLowerCase().includes("bulk") ? " · Bulk" : ""
        }`,
        kind: "email",
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const title = DESK_TITLE[desk];
  const count = merged.length;

  return (
    <details
      className="panel group overflow-hidden"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer list-none border-b border-line bg-sand/60 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="display text-2xl text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {stage ? `${WORK_STAGE_LABEL[stage]} · ` : ""}
              {count} entr{count === 1 ? "y" : "ies"}
            </p>
          </div>
          <span
            className="text-xs font-semibold uppercase tracking-wide text-ink-soft transition group-open:rotate-180"
            aria-hidden
          >
            ▾
          </span>
        </div>
      </summary>
      {count === 0 ? (
        <p className="p-5 text-sm text-ink-soft">No worklogs yet.</p>
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
    </details>
  );
}
