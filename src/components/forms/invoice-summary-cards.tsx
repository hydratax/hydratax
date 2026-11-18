import Link from "next/link";
import { money } from "@/lib/format";
import { openInvoiceTotals } from "@/lib/invoices/totals";
import type { MemoryInvoice } from "@/server/demo/store";

/** Lightweight invoice summary for client overview — not the full workspace. */
export function InvoiceSummaryCards({
  clientId,
  clientSlug = null,
  invoices,
  title = "Invoices",
}: {
  clientId: string;
  clientSlug?: string | null;
  invoices: MemoryInvoice[];
  title?: string;
}) {
  const totals = openInvoiceTotals(invoices);
  const hrefSlug = clientSlug || clientId;

  return (
    <Link
      href={`/clients/${encodeURIComponent(hrefSlug)}/invoices`}
      className={`panel panel-interactive block p-5 ${
        totals.overdueCount ? "border-danger/35 ring-1 ring-danger/15" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl">{title}</h2>
        <span className="open-chip">Open</span>
      </div>
      <p className="mt-2 display text-2xl text-ink">
        {money(totals.amountDuePence)}
      </p>
      <p className="text-sm text-ink-soft">Amount due on open invoices</p>
      {totals.overdueCount > 0 && (
        <p className="mt-2 text-sm text-danger">
          {totals.overdueCount} overdue · {money(totals.overduePence)}
        </p>
      )}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Open</dt>
          <dd className="display text-2xl">{totals.openCount}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Due</dt>
          <dd className="display text-2xl text-violet">{totals.dueSoonCount}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Overdue</dt>
          <dd className="display text-2xl text-danger">{totals.overdueCount}</dd>
        </div>
      </dl>
      <ul className="mt-4 divide-y divide-line text-sm">
        {invoices.slice(0, 5).map((inv) => (
          <li key={inv.id} className="flex justify-between py-2">
            <span className="mono">{inv.invoiceNumber}</span>
            <span className="font-semibold">{money(inv.totalPence)}</span>
          </li>
        ))}
        {invoices.length === 0 && (
          <li className="py-3 text-ink-soft">No invoices yet.</li>
        )}
      </ul>
    </Link>
  );
}
