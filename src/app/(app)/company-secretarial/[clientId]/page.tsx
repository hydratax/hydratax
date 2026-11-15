import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SecretarialFilingGrid } from "@/components/company-secretarial/secretarial-filing-grid";
import { pricingHashForModule } from "@/lib/entitlements";
import { formatDueShort } from "@/lib/filing-due";
import { getPracticeEntitlements } from "@/server/actions/account";
import { requireSession } from "@/server/auth/session";
import { resolveClientFromRef } from "@/server/clients/resolve-client-page";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export const metadata = {
  title: "Company Secretarial desk — HydraTax",
};

export default async function CompanySecretarialDeskPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  await requireSession();
  const entitlements = await getPracticeEntitlements();
  if (!entitlements.modules.includes("company_secretarial")) {
    redirect(`/pricing#${pricingHashForModule("company_secretarial")}`);
  }

  const { clientId: ref } = await params;
  const { client, slug } = await resolveClientFromRef(ref);

  if (client.type !== "limited_company") {
    notFound();
  }

  if (ref !== slug) {
    redirect(`/company-secretarial/${slug}`);
  }

  const ch = client.companiesHouse as ClientCompaniesHouseSnapshot | null;
  const companyNumber = client.companyNumber ?? ch?.companyNumber ?? null;
  const office =
    ch?.registeredOffice?.trim() || client.address?.trim() || null;

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Company Secretarial
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            {client.name}
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Companies House web-filing style options for this company. Live
            filings open existing Hydra wizards; others stay honestly marked
            until submit is wired.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-ink-soft">
            <span className="mono">
              {companyNumber ? `No. ${companyNumber}` : "No company number"}
            </span>
            {ch?.companyStatus ? (
              <span className="badge">{ch.companyStatus}</span>
            ) : null}
            {office ? <span className="max-w-md">{office}</span> : null}
            {ch?.confirmationStatementNextDue ? (
              <span>
                CS due {formatDueShort(ch.confirmationStatementNextDue)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${slug}`}
            className="btn btn-secondary text-sm"
          >
            Client overview
          </Link>
          <Link
            href="/company-secretarial"
            className="btn btn-secondary text-sm"
          >
            All companies
          </Link>
        </div>
      </div>

      <SecretarialFilingGrid
        companyNumber={companyNumber}
        clientId={client.id}
      />
    </div>
  );
}
