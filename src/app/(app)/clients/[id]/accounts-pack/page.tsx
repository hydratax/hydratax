import Link from "next/link";
import { getYearEndAccountsDraftFromBank } from "@/server/actions/bank";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { AccountsPackPeriodForm } from "@/components/forms/accounts-pack-period-form";
import { AccountsPackStatements } from "@/components/forms/accounts-pack-statements";
import { AccountsComparativesForm } from "@/components/forms/accounts-comparatives-form";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { formatStatementAmount, priorFiguresForStatements } from "@/server/accounts/year-end-from-bank";
import {
  companiesHouseAccountsPeriod,
  parseComparatives,
} from "@/lib/accounting-periods";

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
  const { id: ref } = await params;
  const q = await searchParams;
  const { client, slug, clientId } = await loadClientPage(ref, "accounts-pack");
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;
  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });
  const periodEnd =
    q.end && /^\d{4}-\d{2}-\d{2}$/.test(q.end) ? q.end : poa.end;
  const periodStart =
    q.start && /^\d{4}-\d{2}-\d{2}$/.test(q.start) ? q.start : poa.start;

  const draft = await getYearEndAccountsDraftFromBank(
    clientId,
    periodStart,
    periodEnd,
  );
  const comparatives = parseComparatives(
    "accountsComparatives" in client ? client.accountsComparatives : null,
  );
  const showPriorYear = !poa.firstYear;
  const prior = showPriorYear
    ? priorFiguresForStatements(comparatives)
    : null;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Year-end accounts from bank statements · review heads · print PDF pack
      </p>

      <div className="mt-6 space-y-6">
        <AccountsPackPeriodForm
          clientSlug={slug}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />

        {showPriorYear ? (
          <AccountsComparativesForm
            clientId={clientId}
            initial={comparatives}
            priorYearLabel={String(Number(periodEnd.slice(0, 4)) - 1)}
          />
        ) : null}

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
                <Link
                  href={`/clients/${slug}/bank`}
                  className="text-sea underline"
                >
                  Bank
                </Link>{" "}
                page, then refresh.
              </p>
            </div>
            <a
              href={`/clients/${slug}/accounts-pack/print?start=${periodStart}&end=${periodEnd}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              Open printable pack
            </a>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Turnover
              </dt>
              <dd className="figures mt-1 text-lg">{gbp(draft.turnoverPence)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Admin expenses
              </dt>
              <dd className="figures mt-1 text-lg">
                {gbp(draft.adminExpensesPence)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Profit before tax
              </dt>
              <dd className="figures mt-1 text-lg">
                {gbp(draft.profitBeforeTaxPence)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-sand/40 p-3">
              <dt className="text-xs font-bold uppercase text-ink-soft">
                Cash at bank
              </dt>
              <dd className="figures mt-1 text-lg">
                {formatStatementAmount(draft.balanceSheet.cashAtBankPence, gbp)}
              </dd>
            </div>
          </dl>

          {ch?.companyNumber && (
            <p className="mt-4 text-xs text-ink-soft">
              Pack will use Companies House data for {ch.companyNumber}
              {ch.registeredOffice ? ` · ${ch.registeredOffice}` : ""}.
            </p>
          )}
        </div>

        <AccountsPackStatements
          draft={draft}
          companyName={client.name}
          showPriorYear={showPriorYear}
          prior={prior}
        />
      </div>
    </div>
  );
}
