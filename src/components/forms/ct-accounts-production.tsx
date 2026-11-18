"use client";

import Link from "next/link";
import { BankYearEndDesk } from "@/components/forms/bank-year-end-desk";
import { CtMissingBankChase } from "@/components/forms/ct-missing-bank-chase";
import type { BankLedger, LivePlSummary } from "@/lib/bank-ledger";
import { money } from "@/lib/format";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
};

/**
 * CT desk — Accounts Production (closed by default).
 * Mounted above Work logs on Corporation Tax.
 */
export function CtAccountsProduction({
  clientId,
  clientSlug,
  clientEmail = null,
  periodStart,
  periodEnd,
  transactions,
  ledger,
  pl,
  ctDraft,
}: {
  clientId: string;
  clientSlug: string;
  clientEmail?: string | null;
  periodStart: string;
  periodEnd: string;
  transactions: Tx[];
  ledger: BankLedger;
  pl: LivePlSummary;
  ctDraft: {
    turnoverPence: number;
    expensesPence: number;
    profitPence: number;
    lineCount: number;
  };
}) {
  return (
    <details className="panel group overflow-hidden open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
          Accounts Production
        </p>
        <span className="shrink-0 text-ink-soft transition group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="space-y-4 border-t border-line px-5 py-5">
        <CtMissingBankChase
          clientId={clientId}
          periodStart={periodStart}
          periodEnd={periodEnd}
          datedIsos={transactions.map((t) => t.dated)}
          clientEmail={clientEmail}
          deskLabel="CT"
        />

        <div className="rounded-lg border border-line bg-sand/40 p-4">
          <p className="text-xs font-bold uppercase text-ink-soft">
            Corporation Tax draft (from bank)
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Turnover</dt>
              <dd className="mono">{money(ctDraft.turnoverPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Expenses</dt>
              <dd className="mono">{money(ctDraft.expensesPence)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Profit draft</dt>
              <dd className="mono">{money(ctDraft.profitPence)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink-soft">
            From {ctDraft.lineCount} categorised company bank line
            {ctDraft.lineCount === 1 ? "" : "s"}. Review heads below, then enter
            or import the trial balance in the filing form.
          </p>
          <Link
            href={`/clients/${clientSlug}/bank`}
            className="btn btn-secondary mt-3 text-xs"
          >
            Open Bank →
          </Link>
        </div>

        <BankYearEndDesk
          clientId={clientId}
          clientSlug={clientSlug}
          initialLedger={ledger}
          initialPl={pl}
          periodStart={periodStart}
          periodEnd={periodEnd}
          transactions={transactions.map((t) => ({
            id: t.id,
            description: t.description,
            category: t.category,
            amountPence: t.amountPence,
            dated: t.dated,
          }))}
        />
      </div>
    </details>
  );
}
