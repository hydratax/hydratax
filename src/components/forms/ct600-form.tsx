"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCt600, submitCt600 } from "@/server/actions/ct600";
import { money } from "@/lib/format";

export function Ct600Form({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [taxable, setTaxable] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            try {
              const res = await prepareCt600({
                clientId,
                periodStart: String(fd.get("periodStart") || ""),
                periodEnd: String(fd.get("periodEnd") || ""),
                turnoverPounds: String(fd.get("turnoverPounds") || "0"),
                costOfSalesPounds: String(fd.get("costOfSalesPounds") || "0"),
                administrativeExpensesPounds: String(
                  fd.get("administrativeExpensesPounds") || "0",
                ),
                otherIncomePounds: String(fd.get("otherIncomePounds") || "0"),
                tangibleAssetsPounds: String(
                  fd.get("tangibleAssetsPounds") || "0",
                ),
                cashAtBankPounds: String(fd.get("cashAtBankPounds") || "0"),
                debtorsPounds: String(fd.get("debtorsPounds") || "0"),
                creditorsPounds: String(fd.get("creditorsPounds") || "0"),
                calledUpShareCapitalPounds: String(
                  fd.get("calledUpShareCapitalPounds") || "0",
                ),
                profitAndLossAccountPounds: String(
                  fd.get("profitAndLossAccountPounds") || "0",
                ),
              });
              setDraftId(res.draft.id);
              setTaxable(res.draft.taxableProfitPence);
              setPreview(res.xmlPreview);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        <div>
          <label className="label">Period start</label>
          <input name="periodStart" type="date" className="input" defaultValue="2025-04-01" required />
        </div>
        <div>
          <label className="label">Period end</label>
          <input name="periodEnd" type="date" className="input" defaultValue="2026-03-31" required />
        </div>
        {(
          [
            ["turnoverPounds", "Turnover", "85000.00"],
            ["costOfSalesPounds", "Cost of sales", "12000.00"],
            ["administrativeExpensesPounds", "Admin expenses", "18000.00"],
            ["otherIncomePounds", "Other income", "0.00"],
            ["tangibleAssetsPounds", "Tangible assets", "5000.00"],
            ["cashAtBankPounds", "Cash at bank", "22000.00"],
            ["debtorsPounds", "Debtors", "4000.00"],
            ["creditorsPounds", "Creditors", "2500.00"],
            ["calledUpShareCapitalPounds", "Share capital", "100.00"],
            ["profitAndLossAccountPounds", "P&L account", "28400.00"],
          ] as const
        ).map(([name, label, def]) => (
          <div key={name}>
            <label className="label">{label}</label>
            <input name={name} className="input mono" defaultValue={def} required />
          </div>
        ))}
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Building…" : "1 · Prepare CT600"}
          </button>
        </div>
      </form>

      {taxable != null && (
        <p className="text-sm">
          Taxable profit: <span className="mono font-semibold">{money(taxable)}</span>
        </p>
      )}

      {preview && (
        <pre className="max-h-48 overflow-auto rounded-md bg-ink p-3 text-xs text-sand">
          {preview}
        </pre>
      )}

      {draftId && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await submitCt600(draftId, clientId);
              setMessage(`Submitted · ${res.res.correlationId}`);
              router.refresh();
            })
          }
        >
          2 · Submit to HMRC
        </button>
      )}

      {message && <p className="text-sm font-semibold text-ok">{message}</p>}
    </div>
  );
}
