"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSaUpdate } from "@/server/actions/self-assessment";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function SaFilingForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            const fraudMetadata = gatherFraudMetadata();
            const res = await submitSaUpdate({
              clientId,
              taxYear: String(fd.get("taxYear") || "2025-26"),
              periodStart: String(fd.get("periodStart") || ""),
              periodEnd: String(fd.get("periodEnd") || ""),
              fraudMetadata,
              businessId: "XBIS12345678901",
            });
            setMessage(`Submitted · ${res.correlationId}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
    >
      <div>
        <label className="label">Tax year</label>
        <input name="taxYear" className="input" defaultValue="2025-26" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Period start</label>
          <input name="periodStart" type="date" className="input" defaultValue="2026-01-01" required />
        </div>
        <div>
          <label className="label">Period end</label>
          <input name="periodEnd" type="date" className="input" defaultValue="2026-03-31" required />
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        Figures are calculated from digital books for the period, validated with
        Zod, then submitted with fraud-prevention headers.
      </p>
      <FormErrorBanner error={error} />
      {message && <p className="text-sm font-semibold text-ok">{message}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Submitting…" : "Prepare & submit update"}
      </button>
    </form>
  );
}
