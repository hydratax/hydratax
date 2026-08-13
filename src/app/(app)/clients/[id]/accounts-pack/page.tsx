import Link from "next/link";
import { getClient } from "@/server/actions/clients";
import { getYearEndAccountsDraftFromBank } from "@/server/actions/bank";
import { ClientTabs } from "@/components/client-tabs";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { NOTE8_KEYS } from "@/lib/bank-categories";
import { AccountsPackPeriodForm } from "@/components/forms/accounts-pack-period-form";

function defaultPeriodEnd() {
  const now = new Date();
  const y =
    now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-03-31`;
}

function defaultPeriodStart(end: string) {
  const d = new Date(`${end}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export default async function AccountsPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const client = await getClient(id);
  const periodEnd =
    q.end && /^\d{4}-\d{2}-\d{2}$/.test(q.end) ? q.end : defaultPeriodEnd();
  const periodStart =
    q.start && /^\d{4}-\d{2}-\d{2}$/.test(q.start)
      ? q.start
      : defaultPeriodStart(periodEnd);

  const draft = await getYearEndAccountsDraftFromBank(
    id,
    periodStart,
    periodEnd,
  );
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Client workspace
      </p>
      <h1 className="display mt-1 text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Year-end accounts from bank statements · review heads · print PDF pack
      </p>
      <ClientTabs clientId={id} active="bank" />

      <div className="mt-6 space-y-6">
        <AccountsPackPeriodForm
          clientId={id}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />

        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="display text-2xl text-ink">Draft figures</h2>
              <p className="mt-1 text-sm text-ink-soft">
                From {draft.lineCount} bank lines
                {draft.uncategorisedCount
                  ? ` · ${draft.uncategorisedCount} still need review`
                  : ""}
                . Reallocate categories on the{" "}
                <Link href={`/clients/${id}/bank`} className="text-sea underline">
                  Bank
                </Link>{" "}
                page, then refresh.
              </p>
            </div>
            <a
              href={`/clients/${id}/accounts-pack/print?start=${periodStart}&end=${periodEnd}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              Open PDF pack
            </a>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Turnover
              </dt>
              <dd className="mono mt-1 text-lg">{gbp(draft.turnoverPence)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Admin expenses
              </dt>
              <dd className="mono mt-1 text-lg">
                {gbp(draft.adminExpensesPence)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Profit before tax
              </dt>
              <dd className="mono mt-1 text-lg">
                {gbp(draft.profitBeforeTaxPence)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Cash at bank
              </dt>
              <dd className="mono mt-1 text-lg">
                {gbp(draft.balanceSheet.cashAtBankPence)}
              </dd>
            </div>
          </dl>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Note 8 — Administrative expenses
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <tbody className="divide-y divide-line">
              {NOTE8_KEYS.map((k) => {
                const amount = draft.note8[k];
                if (!amount) return null;
                return (
                  <tr key={k}>
                    <td className="py-2 pr-3">{draft.note8Labels[k]}</td>
                    <td className="mono py-2 text-right">{gbp(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!NOTE8_KEYS.some((k) => draft.note8[k]) && (
            <p className="mt-2 text-sm text-ink-soft">
              No expense heads yet — upload a bank CSV/Excel on Bank.
            </p>
          )}

          {ch?.companyNumber && (
            <p className="mt-4 text-xs text-ink-soft">
              Pack will use Companies House data for{" "}
              {ch.companyNumber}
              {ch.registeredOffice ? ` · ${ch.registeredOffice}` : ""}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
