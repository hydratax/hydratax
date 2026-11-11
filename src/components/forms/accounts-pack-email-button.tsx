"use client";

import { EmailToClientButton } from "@/components/forms/email-to-client-button";

/** Email Digitus-style year-end accounts PDF from the accounts pack desk. */
export function AccountsPackEmailButton({
  clientId,
  contactEmail,
  companyName,
  periodStart,
  periodEnd,
}: {
  clientId: string;
  contactEmail?: string | null;
  companyName: string;
  periodStart: string;
  periodEnd: string;
}) {
  return (
    <EmailToClientButton
      clientId={clientId}
      defaultEmail={contactEmail}
      className="btn btn-secondary text-sm"
      label="Email accounts"
      subject={`Year end accounts — ${companyName}`}
      message={`Please find attached the year end accounts for ${companyName}.\n\nKind regards`}
      artifact={{
        type: "accounts_bank_pack",
        periodStart,
        periodEnd,
      }}
    />
  );
}
