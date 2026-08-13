"use client";

import { useRef, useState, useTransition } from "react";
import {
  importBankCsv,
  requestBankConnect,
  updateBankCategory,
} from "@/server/actions/bank";
import {
  CATEGORY_LABELS,
  type BankCategory,
} from "@/lib/bank-categories";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
                setMsg(res.message);
                formRef.current?.reset();
                router.refresh();
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Import failed");
              }
            });
          }}
        >
          <h3 className="display text-xl text-ink">Upload bank statement</h3>
          <p className="text-sm text-ink-soft">
            CSV or Excel for auto-categorisation (fuel, travel, rent, etc.). PDF
            is stored for review. Then prepare the year-end accounts pack.
          </p>
          <input
            type="file"
            name="file"
            required
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm"
          />
          {err && <p className="text-sm text-danger">{err}</p>}
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

      <div className="panel p-5">
        <h3 className="display text-xl text-ink">Year-end accounts pack</h3>
        <p className="mt-1 text-sm text-ink-soft">
          After reviewing categories below, build Digitus-style financial
          statements (P&amp;L, balance sheet, Note 8) and print or save as PDF.
        </p>
        <Link
          href={`/clients/${clientId}/accounts-pack`}
          className="btn btn-primary mt-4 inline-flex"
        >
          Prepare accounts from bank
        </Link>
      </div>

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

      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h3 className="font-semibold text-ink">
            Transactions ({transactions.length})
          </h3>
        </div>
        {transactions.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">
            No bank lines yet. Upload a CSV or Excel export from the client’s
            bank.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="mono px-3 py-2 whitespace-nowrap">
                      {t.dated}
                    </td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="mono px-3 py-2 whitespace-nowrap">
                      {gbp(t.amountPence)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-line bg-white px-2 py-1 text-xs"
                        defaultValue={t.category}
                        onChange={(e) =>
                          start(async () => {
                            await updateBankCategory(
                              t.id,
                              e.target.value as BankCategory,
                            );
                            router.refresh();
                          })
                        }
                      >
                        {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <span className="ml-2 text-[10px] text-ink-soft">
                        {t.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
