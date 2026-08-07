import { getClient } from "@/server/actions/clients";
import { listLedgerEntries } from "@/server/actions/ledger";
import { ClientTabs } from "@/components/client-tabs";
import { LedgerForm } from "@/components/forms/ledger-form";
import { money } from "@/lib/format";

export default async function BooksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const entries = await listLedgerEntries(id);

  const income = entries
    .filter((e) => e.type === "income")
    .reduce((s, e) => s + e.amountPence, 0);
  const expense = entries
    .filter((e) => e.type === "expense")
    .reduce((s, e) => s + e.amountPence, 0);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">Digital books in integer pence</p>
      <ClientTabs clientId={id} active="books" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-ink-soft">Income</p>
          <p className="display mt-1 text-2xl">{money(income)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-ink-soft">Expenses</p>
          <p className="display mt-1 text-2xl">{money(expense)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase text-ink-soft">Net</p>
          <p className="display mt-1 text-2xl">{money(income - expense)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <h2 className="display text-2xl">Add entry</h2>
          <div className="mt-4">
            <LedgerForm clientId={id} />
          </div>
        </div>
        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Net</th>
                <th className="px-3 py-2">VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono px-3 py-2">{e.dated}</td>
                  <td className="px-3 py-2">
                    <span className="badge badge-muted mr-2">{e.type}</span>
                    {e.description}
                  </td>
                  <td className="mono px-3 py-2">{money(e.amountPence)}</td>
                  <td className="mono px-3 py-2">{money(e.vatPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
