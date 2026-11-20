"use client";

import { EmailToClientButton } from "@/components/forms/email-to-client-button";

export function SaReturnDocuments({
  clientId,
  returnId,
  taxYear,
  personName,
  defaultEmail = null,
}: {
  clientId: string;
  returnId: string;
  taxYear: string;
  personName: string;
  defaultEmail?: string | null;
}) {
  const sa100View = `/api/clients/${clientId}/sa100/${returnId}/sa100.pdf?view=1`;
  const sa302View = `/api/clients/${clientId}/sa100/${returnId}/sa302.pdf?view=1`;
  const sa100Dl = `/api/clients/${clientId}/sa100/${returnId}/sa100.pdf`;
  const sa302Dl = `/api/clients/${clientId}/sa100/${returnId}/sa302.pdf`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
      <a
        className="text-sea underline-offset-2 hover:underline"
        href={sa100View}
        target="_blank"
        rel="noreferrer"
      >
        View SA100
      </a>
      <a
        className="text-sea underline-offset-2 hover:underline"
        href={sa302View}
        target="_blank"
        rel="noreferrer"
      >
        View SA302
      </a>
      <a
        className="text-ink-soft underline-offset-2 hover:underline"
        href={sa100Dl}
        target="_blank"
        rel="noreferrer"
      >
        Download SA100
      </a>
      <a
        className="text-ink-soft underline-offset-2 hover:underline"
        href={sa302Dl}
        target="_blank"
        rel="noreferrer"
      >
        Download SA302
      </a>
      <EmailToClientButton
        clientId={clientId}
        defaultEmail={defaultEmail}
        compact
        label="Email SA100 + SA302"
        className="btn btn-secondary text-xs"
        subject={`SA100 & SA302 — ${personName} (${taxYear})`}
        message={`Please find attached your Self Assessment return (SA100) and tax calculation (SA302) for ${taxYear}.\n\nKind regards`}
        artifact={{
          type: "sa_pdf",
          returnId,
          docs: ["sa100", "sa302"],
        }}
      />
    </div>
  );
}
