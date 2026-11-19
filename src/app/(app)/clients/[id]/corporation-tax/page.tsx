import { Suspense } from "react";
import { listCt600Returns } from "@/server/actions/ct600";
import { listClientDocuments } from "@/server/actions/documents";
import { getTaxDraftFromBank, listBankTransactions } from "@/server/actions/bank";
import {
  getBankLedger,
  getLivePlFromBank,
} from "@/server/actions/bank-ledger";
import { requireModule } from "@/server/auth/session";
import { Ct600PeriodWorkspace } from "@/components/forms/ct600-period-workspace";
import { CtAccountsProduction } from "@/components/forms/ct-accounts-production";
import { ClientDeskWorklogs } from "@/components/client-desk-worklogs";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";
import {
  EMPTY_COMPARATIVES,
  listCorporationTaxPeriodsSinceIncorporation,
} from "@/lib/accounting-periods";
import { loadPriorYearComparatives } from "@/server/accounts/load-prior-year-comparatives";
import { emptyBankLedger } from "@/lib/bank-ledger";
import { AbbrInfo } from "@/components/desk/abbr-info";

export default async function CorporationTaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string; start?: string; end?: string }>;
}) {
  await requireModule("corporation_tax");
  const { id: ref } = await params;
  const query = await searchParams;
  const { client, slug, clientId } = await loadClientPage(ref, "corporation-tax");
  const returnsRaw = await listCt600Returns(clientId).catch(() => []);
  const returns = returnsRaw.map((r) => ({
    id: String(r.id),
    periodStart: String(r.periodStart),
    periodEnd: String(r.periodEnd),
    status: String(r.status),
  }));
  const filedElsewhere = query.note === "filed-elsewhere";
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;
  const incorporatedOn = ch?.incorporatedOn?.slice(0, 10) ?? null;
  const companyNumber =
    ch?.companyNumber || client.companyNumber || null;
  const ctPeriods = listCorporationTaxPeriodsSinceIncorporation({
    incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
    yearsAhead: 0,
  });

  const initialStart =
    query.start && /^\d{4}-\d{2}-\d{2}$/.test(query.start)
      ? query.start
      : undefined;
  const initialEnd =
    query.end && /^\d{4}-\d{2}-\d{2}$/.test(query.end) ? query.end : undefined;

  const periodEndHint =
    initialEnd ?? ch?.accountsPeriodEnd ?? ch?.lastAccountsMadeUpTo ?? null;

  const [chFiling, documents, priorYear, bankTxs, taxDraft, livePl, ledger] =
    await Promise.all([
      companyNumber && isCompaniesHouseApiConfigured()
        ? getLastAccountsFiling(companyNumber).catch(() => null)
        : Promise.resolve(null),
      listClientDocuments(clientId).catch(() => []),
      loadPriorYearComparatives({
        clientId,
        companyNumber,
        periodEnd: periodEndHint,
        savedComparatives:
          "accountsComparatives" in client ? client.accountsComparatives : null,
      }).catch(() => ({
        comparatives: { ...EMPTY_COMPARATIVES },
        source: "none" as const,
        madeUpTo: null as string | null,
      })),
      listBankTransactions(clientId).catch(() => []),
      getTaxDraftFromBank(clientId).catch(() => null),
      getLivePlFromBank(clientId).catch(() => null),
      getBankLedger(clientId).catch(() => emptyBankLedger()),
    ]);

  const accountsProduction = {
    transactions: bankTxs.map((t) => ({
      id: String(t.id),
      dated: String(t.dated),
      description: String(t.description),
      amountPence: Number(t.amountPence),
      category: String(t.category),
    })),
    ledger: livePl?.ledger ?? ledger,
    pl: livePl?.pl ?? {
      turnoverPence: 0,
      costOfSalesPence: 0,
      grossProfitPence: 0,
      expensesPence: 0,
      depreciationPence: 0,
      financeCostsPence: 0,
      mortgageInterestPaidPence: 0,
      mortgageInterestDuePence: 0,
      profitBeforeTaxPence: 0,
      fixedAssetsNbvPence: 0,
      propertyCostPence: 0,
      loansClosingPence: 0,
      mortgagesClosingPence: 0,
      lineCount: 0,
      uncategorisedCount: 0,
    },
    ctDraft: {
      turnoverPence: taxDraft?.corporationTax.turnoverPence ?? 0,
      expensesPence: taxDraft?.corporationTax.expensesPence ?? 0,
      profitPence: taxDraft?.corporationTax.profitPence ?? 0,
      lineCount: taxDraft?.lineCount ?? 0,
    },
  };

  const localAccounts = documents.find((d) => {
    const cat = "category" in d ? String(d.category) : "";
    const name =
      "filename" in d
        ? String(d.filename)
        : "name" in d
          ? String((d as { name?: string }).name)
          : "";
    return (
      cat === "accounts" ||
      cat === "companies_house" ||
      /account/i.test(name)
    );
  });
  const localPreviewUrl =
    localAccounts && "blobUrl" in localAccounts
      ? String(localAccounts.blobUrl)
      : null;
  const localFilename =
    localAccounts && "filename" in localAccounts
      ? String(localAccounts.filename)
      : null;
  const chPreviewUrl =
    companyNumber && chFiling?.documentMetadataUrl
      ? `/api/companies-house/document?company=${encodeURIComponent(companyNumber)}`
      : null;

  const lastFiledAccounts = chFiling
    ? {
        description: chFiling.description,
        filedOn: chFiling.filedOn,
        madeUpTo: chFiling.madeUpTo,
        pages: chFiling.pages,
        registerUrl: chFiling.registerUrl,
        companyFilingHistoryUrl: chFiling.companyFilingHistoryUrl,
        chPreviewUrl,
        localPreviewUrl,
        localFilename,
      }
    : null;

  const company = {
    name: ch?.companyName || client.name,
    companyNumber,
    registeredOffice: ch?.registeredOffice ?? null,
    companyStatus: ch?.companyStatus ?? null,
    sicCodes: ch?.sicCodes ?? [],
    directors: (ch?.directors ?? [])
      .filter((d) => !d.resignedOn)
      .map((d) => d.name)
      .filter(Boolean),
    incorporatedOn: ch?.incorporatedOn ?? null,
    accountsNextDue: ch?.accountsNextDue ?? null,
  };

  const accountsCheckoutHref = companyNumber
    ? `/companies-house/accounts-ixbrl?company=${encodeURIComponent(companyNumber)}&clientId=${encodeURIComponent(clientId)}&pay=1`
    : `/companies-house/accounts-ixbrl?clientId=${encodeURIComponent(clientId)}&pay=1`;

  const todayIso = new Date().toISOString().slice(0, 10);
  const latestCompleted = [...ctPeriods]
    .filter((p) => p.end < todayIso)
    .sort((a, b) => a.end.localeCompare(b.end))
    .at(-1);
  const apPeriodEnd =
    initialEnd ??
    latestCompleted?.end ??
    ch?.lastAccountsMadeUpTo?.slice(0, 10) ??
    todayIso;
  const apPeriodStart =
    initialStart ??
    latestCompleted?.start ??
    (() => {
      const end = new Date(`${apPeriodEnd}T12:00:00Z`);
      const start = new Date(end);
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      start.setUTCDate(start.getUTCDate() + 1);
      return start.toISOString().slice(0, 10);
    })();

  return (
    <div>
      {filedElsewhere ? (
        <div className="mb-4 rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          <p className="inline-flex items-center gap-1 font-semibold text-ink">
            CT600
            <AbbrInfo code="CT600" />
            filed elsewhere
          </p>
        </div>
      ) : null}

      {client.type !== "limited_company" ? (
        <div className="panel p-5 text-ink-soft">
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
            CT600
            <AbbrInfo code="CT600" />
          </span>{" "}
          is for limited companies.
        </div>
      ) : (
        <Suspense
          fallback={
            <p className="text-sm text-ink-soft">Loading CT600 workspace…</p>
          }
        >
          <Ct600PeriodWorkspace
            clientId={clientId}
            clientSlug={slug}
            contactEmail={client.contactEmail ?? null}
            periods={ctPeriods}
            returns={returns}
            initialStart={initialStart}
            initialEnd={initialEnd}
            incorporatedOn={incorporatedOn}
            company={company}
            accountsCheckoutHref={accountsCheckoutHref}
            lastFiledAccounts={lastFiledAccounts}
            priorYearComparatives={priorYear.comparatives}
            priorYearSource={priorYear.source}
            priorYearMadeUpTo={priorYear.madeUpTo}
          />
        </Suspense>
      )}

      {client.type === "limited_company" ? (
        <div className="mt-6">
          <CtAccountsProduction
            clientId={clientId}
            clientSlug={slug}
            clientEmail={client.contactEmail ?? null}
            periodStart={apPeriodStart}
            periodEnd={apPeriodEnd}
            transactions={accountsProduction.transactions}
            ledger={accountsProduction.ledger}
            pl={accountsProduction.pl}
            ctDraft={accountsProduction.ctDraft}
          />
        </div>
      ) : null}

      <ClientDeskWorklogs clientId={clientId} desk="ct" />
    </div>
  );
}
