"use client";

import { useState, useTransition } from "react";
import { saveAccountsComparatives } from "@/server/actions/accounts-comparatives";
import type { PriorYearComparatives } from "@/lib/accounting-periods";
import { EMPTY_COMPARATIVES } from "@/lib/accounting-periods";

function penceToPounds(n: number | null): string {
  if (n == null) return "";
  return (n / 100).toFixed(2);
}

function poundsToPence(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const FIELDS: Array<{
  key: keyof PriorYearComparatives;
  label: string;
  hint?: string;
}> = [
  {
    key: "cashAtBankPence",
    label: "Cash at bank (brought forward)",
    hint: "Opening cash / prior-year BS",
  },
  {
    key: "profitAndLossReservePence",
    label: "Profit and loss reserve (brought forward)",
    hint: "From last year’s accounts / CT600",
  },
  { key: "shareCapitalPence", label: "Share capital" },
  { key: "fixedAssetsPence", label: "Fixed assets" },
  { key: "otherDebtorsPence", label: "Other debtors" },
  { key: "creditorsWithinOneYearPence", label: "Creditors due within one year" },
  { key: "creditorsAfterOneYearPence", label: "Creditors due after one year" },
  { key: "turnoverPence", label: "Turnover" },
  { key: "costOfSalesPence", label: "Cost of sales" },
  { key: "adminExpensesPence", label: "Administrative expenses" },
  { key: "taxationPence", label: "Taxation" },
  { key: "dividendsPence", label: "Dividends" },
];

export function AccountsComparativesForm({
  clientId,
  initial,
  priorYearLabel,
  sourceNote,
}: {
  clientId: string;
  initial: PriorYearComparatives | null;
  priorYearLabel: string;
  /** e.g. Loaded from prior CT600 */
  sourceNote?: string | null;
}) {
  const [pending, start] = useTransition();
  const [values, setValues] = useState<PriorYearComparatives>(
    initial ?? EMPTY_COMPARATIVES,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            await saveAccountsComparatives({
              clientId,
              ...values,
            });
            setMessage("Prior-year figures saved.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <div>
        <h2 className="display text-2xl text-ink">
          Prior year ({priorYearLabel})
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Cash and the profit and loss reserve are used as brought-forward
          figures on this year’s balance sheet. Accubee prefers last year’s
          CT600 / filed accounts when already prepared.
        </p>
        {sourceNote ? (
          <p className="mt-1 text-sm text-ok">{sourceNote}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Line</th>
              <th className="px-3 py-2 font-semibold text-right">Amount £</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f.key} className="border-t border-line">
                <td className="px-3 py-2">
                  <label htmlFor={`py-${f.key}`} className="font-medium text-ink">
                    {f.label}
                  </label>
                  {f.hint ? (
                    <p className="text-xs text-ink-soft">{f.hint}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    id={`py-${f.key}`}
                    className="input figures ml-auto w-36 text-right"
                    inputMode="decimal"
                    value={penceToPounds(values[f.key])}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [f.key]: poundsToPence(e.target.value),
                      }))
                    }
                    placeholder="0.00"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-ok">{message}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save prior-year figures"}
      </button>
    </form>
  );
}
