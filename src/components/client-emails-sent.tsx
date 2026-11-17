import { formatWorkLogWhen } from "@/lib/client-work-stage";

type EmailRow = {
  id: string;
  subject: string;
  toEmail: string;
  createdAt: string;
  kind: string;
  messagePreview?: string | null;
};

function kindLabel(kind: string) {
  if (kind === "sa_missing_bank_statements") return "SA missing bank statements";
  if (kind === "ct_missing_bank_statements") return "CT missing bank statements";
  if (kind.startsWith("template:")) return kind.replace("template:", "Template · ");
  if (kind.startsWith("bulk_")) return `Bulk · ${kind.replace(/^bulk_/, "").replace(/_/g, " ")}`;
  if (kind === "bulk") return "Bulk email";
  return kind || "Email";
}

/**
 * Dedicated record of every email sent to this client (single or bulk),
 * shown at the bottom of the client overview.
 */
export function ClientEmailsSent({ emails }: { emails: EmailRow[] }) {
  const rows = [...emails].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line bg-sand/60 px-4 py-3">
        <h2 className="display text-2xl text-ink">Emails sent to client</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every outbound email for this client — bank chases, bulk runs, and
          one-offs — with date and time.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">
          No emails logged yet for this client.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{row.subject}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  To {row.toEmail} · {kindLabel(row.kind)}
                </p>
                {row.messagePreview ? (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                    {row.messagePreview}
                  </p>
                ) : null}
              </div>
              <time
                dateTime={row.createdAt}
                className="mono shrink-0 text-xs text-ink-soft"
              >
                {formatWorkLogWhen(row.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
