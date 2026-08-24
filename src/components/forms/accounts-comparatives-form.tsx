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
    hint: "Taken as opening cash and the prior-year balance sheet figure",
  },
  {
    key: "profitAndLossReservePence",
    label: "Profit and loss reserve (brought forward)",
    hint: "Taken from last year’s accounts if you have them",
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
}: {
  clientId: string;
  initial: PriorYearComparatives | null;
  priorYearLabel: string;
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
        <h2 className="display text-2xl text-ink">Prior year ({priorYearLabel})</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Cash and the profit and loss reserve are used as brought-forward
          figures on this year’s balance sheet. Enter other comparatives from
          the last filed accounts so they appear in the prior-year column.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`py-${f.key}`}>
              {f.label}
            </label>
            <input
              id={`py-${f.key}`}
              className="input"
              inputMode="decimal"
              placeholder="0.00"
              value={penceToPounds(values[f.key])}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [f.key]: poundsToPence(e.target.value),
                }))
              }
            />
            {f.hint ? (
              <p className="mt-1 text-xs text-ink-soft">{f.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-sea">{message}</p> : null}
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Save prior-year figures"}
      </button>
    </form>
  );
}
