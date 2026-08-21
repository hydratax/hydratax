"use client";

import { useState, useTransition } from "react";
import { sendClientDocumentEmail } from "@/server/actions/email";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Doc = { id: string; filename: string };

export function EmailDocumentsForm({
  clientId,
  defaultEmail,
  documents,
}: {
  clientId: string;
  defaultEmail?: string | null;
  documents: Doc[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <form
      className="panel gloss-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const fd = new FormData(e.currentTarget);
        const documentIds = fd.getAll("documentIds").map(String);
        start(async () => {
          try {
            const res = await sendClientDocumentEmail({
              clientId,
              toEmail: String(fd.get("toEmail") ?? ""),
              subject: String(fd.get("subject") ?? ""),
              message: String(fd.get("message") ?? ""),
              documentIds,
            });
            setOk(res.message);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Send failed");
          }
        });
      }}
    >
      <div>
        <h3 className="display text-xl text-ink">Email client</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Send demanded documents or requests directly from the practice desk.
          Set <code className="mono text-xs">RESEND_API_KEY</code> for live
          delivery.
        </p>
      </div>

      <label className="block text-sm font-semibold">
        Client email
        <input
          name="toEmail"
          type="email"
          required
          defaultValue={defaultEmail ?? ""}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>

      <label className="block text-sm font-semibold">
        Subject
        <input
          name="subject"
          required
          defaultValue="Documents from your accountant"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>

      <label className="block text-sm font-semibold">
        Message
        <textarea
          name="message"
          required
          rows={4}
          defaultValue="Please find the documents you requested attached / linked below."
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>

      {documents.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold">Attach / link documents</legend>
          <ul className="mt-2 space-y-1">
            {documents.map((d) => (
              <li key={d.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="documentIds" value={d.id} />
                  {d.filename}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <FormErrorBanner error={error} />
      {ok && <p className="text-sm text-ok">{ok}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Sending…" : "Send email"}
      </button>
    </form>
  );
}
