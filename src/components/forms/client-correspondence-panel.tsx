"use client";

import { useMemo, useState, useTransition } from "react";
import {
  markDocumentRequestReceived,
  previewCorrespondenceTemplate,
  sendTemplatedCorrespondence,
  type DocumentRequestRecord,
} from "@/server/actions/correspondence";
import type { CorrespondenceTemplateKey } from "@/lib/correspondence-templates";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const TEMPLATE_OPTIONS: {
  key: CorrespondenceTemplateKey;
  label: string;
}[] = [
  { key: "bank_statements_request", label: "Bank statements request" },
  { key: "accounts_info_request", label: "Year-end information request" },
  {
    key: "confirmation_statement_reminder",
    label: "Confirmation statement reminder",
  },
  { key: "accounts_due_reminder", label: "Accounts filing reminder" },
  { key: "vat_records_request", label: "VAT records request" },
  { key: "payroll_info_request", label: "Payroll information request" },
];

export function ClientCorrespondencePanel({
  clientId,
  contactEmail,
  documentStatusLabel,
  periodLabel,
  requests,
}: {
  clientId: string;
  contactEmail: string | null;
  documentStatusLabel: string;
  periodLabel: string | null;
  requests: DocumentRequestRecord[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [templateKey, setTemplateKey] =
    useState<CorrespondenceTemplateKey>("bank_statements_request");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [previewed, setPreviewed] = useState(false);

  const openRequests = useMemo(
    () => requests.filter((r) => r.status === "requested"),
    [requests],
  );

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl text-ink">Correspondence</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Templates use the company year end for bank statement periods
              {periodLabel ? ` · current period ${periodLabel}` : ""}.
            </p>
          </div>
          <span className="rounded-md border border-line bg-sand px-2.5 py-1 text-xs font-semibold text-ink">
            {documentStatusLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Template
            <select
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              value={templateKey}
              disabled={pending}
              onChange={(e) => {
                setTemplateKey(e.target.value as CorrespondenceTemplateKey);
                setPreviewed(false);
              }}
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Channel
            <select
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              value={channel}
              disabled={pending}
              onChange={(e) =>
                setChannel(e.target.value as "email" | "whatsapp")
              }
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp (logged)</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              setOk(null);
              start(async () => {
                try {
                  const preview = await previewCorrespondenceTemplate({
                    clientId,
                    templateKey,
                  });
                  setSubject(preview.subject);
                  setBody(preview.body);
                  setPreviewed(true);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Preview failed",
                  );
                }
              });
            }}
          >
            Preview with year-end dates
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || (channel === "email" && !contactEmail)}
            onClick={() => {
              setError(null);
              setOk(null);
              start(async () => {
                try {
                  if (!previewed) {
                    const preview = await previewCorrespondenceTemplate({
                      clientId,
                      templateKey,
                    });
                    setSubject(preview.subject);
                    setBody(preview.body);
                  }
                  const res = await sendTemplatedCorrespondence({
                    clientId,
                    templateKey,
                    channel,
                    toEmail: contactEmail ?? undefined,
                  });
                  setOk(
                    `Sent · ${res.statusLabel}. Message saved to this client’s communications.`,
                  );
                  setPreviewed(true);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Send failed");
                }
              });
            }}
          >
            {pending ? "Sending…" : "Send template"}
          </button>
        </div>

        {!contactEmail && channel === "email" && (
          <p className="mt-3 text-sm text-ink-soft">
            Add a contact email on the client overview before emailing.
          </p>
        )}

        <FormErrorBanner error={error} />
        {ok && <p className="mt-3 text-sm text-sea">{ok}</p>}

        {(subject || body) && (
          <div className="mt-4 space-y-3 rounded-lg border border-line bg-sand/40 p-4 text-sm">
            <p>
              <span className="font-semibold text-ink">Subject:</span> {subject}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-ink-soft">
              {body}
            </pre>
          </div>
        )}
      </div>

      {openRequests.length > 0 && (
        <div className="panel p-5">
          <h3 className="font-semibold text-ink">Open document requests</h3>
          <ul className="mt-3 divide-y divide-line">
            {openRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">
                    {r.templateKey.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {r.periodStart && r.periodEnd
                      ? `${r.periodStart} → ${r.periodEnd}`
                      : "No period"}{" "}
                    · {r.channel}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      await markDocumentRequestReceived({
                        clientId,
                        requestId: r.id,
                        status: "received",
                      });
                      setOk("Marked bank statements received.");
                    });
                  }}
                >
                  Mark received
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
