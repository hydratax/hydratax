"use client";

import { useRef, useState, useTransition } from "react";
import {
  importBankCsv,
  requestBankConnect,
} from "@/server/actions/bank";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { BankCategorisedView } from "@/components/forms/bank-categorised-view";
import { recategoriseBankTransactions } from "@/server/actions/bank-recategorise";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

export function BankWorkspace({
  clientId,
  transactions,
  draft,
}: {
  clientId: string;
  transactions: Tx[];
  draft: {
    selfAssessment: {
      turnoverPence: number;
      otherIncomePence: number;
      expensesPence: number;
    };
    corporationTax: {
      turnoverPence: number;
      expensesPence: number;
      profitPence: number;
    };
    lineCount: number;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function gbp(pence: number) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);
  }

  const hasTransactions = transactions.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          ref={formRef}
          className="panel gloss-card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setMsg(null);
            const fd = new FormData(e.currentTarget);
            fd.set("clientId", clientId);
            start(async () => {
              try {
                const res = await importBankCsv(fd);
                if (!res.ok) {
                  setErr(res.error);
                  return;
                }
                setMsg(res.message);
                formRef.current?.reset();
                router.refresh();
                document
                  .getElementById("categorised-transactions")
                  ?.scrollIntoView({ behavior: "smooth" });
              } catch (error) {
                setErr(messageFromUnknown(error, "Import failed"));
              }
            });
          }}
        >
          <h3 className="display text-xl text-ink">Upload bank statement</h3>
          <p className="text-sm text-ink-soft">
            Import CSV or Excel — we auto-sort into fuel, insurance, salaries,
            subcontractors, finance, and other account heads. Reallocate any line
            below, then open accounts with one click.
          </p>
          <input
            type="file"
            name="file"
            required
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm"
          />
          <FormErrorBanner error={err} />
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Importing…" : "Import & categorise"}
          </button>
        </form>

        <div className="panel space-y-3 p-5">
          <h3 className="display text-xl text-ink">Connect bank (Open Banking)</h3>
          <p className="text-sm text-ink-soft">
            With client consent, live feeds can populate the same categorisation
            pipeline used for CSV — then one-click SA / CT drafts.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await requestBankConnect({
                  clientId,
                  provider: "truelayer",
                });
                setMsg(res.message);
              })
            }
          >
            Request TrueLayer connect
          </button>
        </div>
      </div>

      {hasTransactions ? (
        <div className="panel overflow-hidden border-sea/30 bg-sea/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="display text-xl text-ink">Ready for accounts</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {draft.lineCount} categorised lines — review sections below, then
                build the year-end pack.
              </p>
            </div>
            <Link
              href={`/clients/${clientId}/accounts-pack`}
              className="btn btn-primary shrink-0"
            >
              Open accounts pack →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="panel p-5">
        <h3 className="display text-xl text-ink">One-click tax drafts</h3>
        <p className="mt-1 text-sm text-ink-soft">
          From {draft.lineCount} categorised lines (review before HMRC submit).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              Self Assessment draft
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Turnover</dt>
                <dd className="mono">{gbp(draft.selfAssessment.turnoverPence)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Other income</dt>
                <dd className="mono">
                  {gbp(draft.selfAssessment.otherIncomePence)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Expenses</dt>
                <dd className="mono">{gbp(draft.selfAssessment.expensesPence)}</dd>
              </div>
            </dl>
            <Link
              href={`/clients/${clientId}/self-assessment`}
              className="btn btn-primary mt-4 text-sm"
            >
              Open Self Assessment
            </Link>
          </div>
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              Corporation Tax draft
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Turnover</dt>
                <dd className="mono">{gbp(draft.corporationTax.turnoverPence)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expenses</dt>
                <dd className="mono">{gbp(draft.corporationTax.expensesPence)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Profit draft</dt>
                <dd className="mono">{gbp(draft.corporationTax.profitPence)}</dd>
              </div>
            </dl>
            <Link
              href={`/clients/${clientId}/corporation-tax`}
              className="btn btn-primary mt-4 text-sm"
            >
              Open CT600
            </Link>
          </div>
        </div>
      </div>

      <div id="categorised-transactions" className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sand/60 px-4 py-3">
          <div>
            <h3 className="font-semibold text-ink">Categorised transactions</h3>
            <p className="text-xs text-ink-soft">
              Grouped by account head — use Move to reallocate (e.g. Esso → fuel).
            </p>
          </div>
          {hasTransactions ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setErr(null);
                  const res = await recategoriseBankTransactions(clientId);
                  if (!res.ok) {
                    setErr(res.error);
                    return;
                  }
                  setMsg(`Re-applied merchant rules to ${res.updated} lines.`);
                  router.refresh();
                })
              }
            >
              Re-apply auto rules
            </button>
          ) : null}
        </div>
        <BankCategorisedView clientId={clientId} transactions={transactions} />
      </div>
    </div>
  );
}
