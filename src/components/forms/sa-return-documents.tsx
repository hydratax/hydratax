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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
      <a
        className="text-sea underline-offset-2 hover:underline"
        href={`/api/clients/${clientId}/sa100/${returnId}/sa100.pdf`}
        target="_blank"
        rel="noreferrer"
      >
        SA100 pack
      </a>
      <a
        className="text-sea underline-offset-2 hover:underline"
        href={`/api/clients/${clientId}/sa100/${returnId}/sa302.pdf`}
        target="_blank"
        rel="noreferrer"
      >
        SA302 PDF
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
