import { Suspense } from "react";
import { listCt600Returns } from "@/server/actions/ct600";
import { listClientDocuments } from "@/server/actions/documents";
import { requireModule } from "@/server/auth/session";
import { Ct600PeriodWorkspace } from "@/components/forms/ct600-period-workspace";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";
import { listCorporationTaxPeriodsSinceIncorporation } from "@/lib/accounting-periods";

export default async function CorporationTaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string; start?: string; end?: string }>;
}) {
  try {
    await requireModule("corporation_tax");
  } catch {
    redirect("/clients");
  }
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

  const [chFiling, documents] = await Promise.all([
    companyNumber && isCompaniesHouseApiConfigured()
      ? getLastAccountsFiling(companyNumber).catch(() => null)
      : Promise.resolve(null),
    listClientDocuments(clientId).catch(() => []),
  ]);

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

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Corporation Tax · UTR {client.utr ?? "not set"} · Co.{" "}
        {client.companyNumber ?? "not set"}
        {incorporatedOn ? ` · Incorporated ${incorporatedOn}` : ""}
      </p>

      {filedElsewhere && (
        <div className="mb-4 rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          <p className="font-semibold text-ink">CT600 filed elsewhere</p>
          <p className="mt-1 text-ink-soft">
            If this return was submitted outside HydraTax, keep a note on the
            client documents and continue with the current period when HMRC
            allows.
          </p>
        </div>
      )}

      {client.type !== "limited_company" ? (
        <div className="panel p-5 text-ink-soft">
          Corporation Tax CT600 is for limited companies.
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
            periods={ctPeriods}
            returns={returns}
            initialStart={initialStart}
            initialEnd={initialEnd}
            incorporatedOn={incorporatedOn}
            company={company}
            accountsCheckoutHref={accountsCheckoutHref}
            lastFiledAccounts={lastFiledAccounts}
          />
        </Suspense>
      )}
    </div>
  );
}
