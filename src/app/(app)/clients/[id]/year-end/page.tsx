import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getClient } from "@/server/actions/clients";
import { listClientDocuments } from "@/server/actions/documents";
import { requireSession } from "@/server/auth/session";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";
import {
  YearEndFilingForm,
  type YearEndFilingMode,
} from "@/components/forms/year-end-filing-form";

function parseMode(raw: string | undefined): YearEndFilingMode {
  if (raw === "accounts" || raw === "both" || raw === "ct600") return raw;
  return "both";
}

export default async function YearEndFilingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; company?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const client = await getClient(id);

  if (client.type !== "limited_company") {
    redirect(`/clients/${id}`);
  }

  const mode = parseMode(query.mode);
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;

  const companyNumber =
    query.company?.trim().toUpperCase() ||
    ch?.companyNumber ||
    client.companyNumber ||
    null;

  const [chFiling, documents] = await Promise.all([
    companyNumber && isCompaniesHouseApiConfigured()
      ? getLastAccountsFiling(companyNumber).catch(() => null)
      : Promise.resolve(null),
    listClientDocuments(id).catch(() => []),
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
    : companyNumber
      ? {
          description: "Accounts on Companies House",
          filedOn: null,
          madeUpTo: null,
          pages: null,
          registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts`,
          companyFilingHistoryUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts`,
          chPreviewUrl: isCompaniesHouseApiConfigured()
            ? `/api/companies-house/document?company=${encodeURIComponent(companyNumber)}`
            : null,
          localPreviewUrl,
          localFilename,
        }
      : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/clients/${id}`}
          className="text-sm font-semibold text-sea hover:underline"
        >
          ← Back to {client.name}
        </Link>
        <Link
          href={`/clients/${id}/corporation-tax`}
          className="text-sm text-ink-soft hover:text-ink"
        >
          Classic CT600 workspace
        </Link>
      </div>

      <Suspense
        fallback={
          <p className="text-sm text-ink-soft">Loading year-end filing…</p>
        }
      >
        <YearEndFilingForm
          clientId={id}
          initialMode={mode}
          lockFilingMode
          persistKey={`hydratax_year_end_client_${id}`}
          postSignInPath={`/clients/${id}/year-end?mode=${mode}${companyNumber ? `&company=${encodeURIComponent(companyNumber)}` : ""}&resume=1`}
          company={{
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
          }}
          defaultPeriodEnd={ch?.accountsPeriodEnd ?? null}
          accountsCheckoutHref={
            companyNumber
              ? `/companies-house/accounts-ixbrl?company=${encodeURIComponent(companyNumber)}&clientId=${encodeURIComponent(id)}&pay=1`
              : `/companies-house/accounts-ixbrl?clientId=${encodeURIComponent(id)}&pay=1`
          }
          lastFiledAccounts={lastFiledAccounts}
        />
      </Suspense>
    </div>
  );
}
