import Link from "next/link";
import { redirect } from "next/navigation";
import { SecretarialCompanyCard } from "@/components/company-secretarial/secretarial-company-card";
import { clientSlugFor } from "@/lib/client-slug";
import { formatDueShort } from "@/lib/filing-due";
import { pricingHashForModule } from "@/lib/entitlements";
import { listClients } from "@/server/actions/clients";
import { getPracticeEntitlements } from "@/server/actions/account";
import { requireSession } from "@/server/auth/session";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export const metadata = {
  title: "Company Secretarial — HydraTax",
};

export default async function CompanySecretarialLandingPage() {
  await requireSession();
  const entitlements = await getPracticeEntitlements();
  const unlocked = entitlements.modules.includes("company_secretarial");

  if (!unlocked) {
    redirect(`/pricing#${pricingHashForModule("company_secretarial")}`);
  }

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const companies = clients.filter((c) => c.type === "limited_company");
  const cap = entitlements.maxSecretarialCompanies;

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Company Secretarial
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            Limited companies
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Open a company to prepare Companies House web-style filings — name,
            registered office, officers, PSC, confirmation statement and more.
          </p>
          {cap != null && companies.length > cap ? (
            <p className="mt-3 max-w-2xl text-sm text-ink-soft">
              Your plan covers up to {cap} companies; you have {companies.length}{" "}
              on the desk.{" "}
              <Link
                href={`/pricing#${pricingHashForModule("company_secretarial")}`}
                className="font-semibold text-sea"
              >
                Scale pricing
              </Link>{" "}
              uses £5 per 10 companies.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients/new" className="btn btn-secondary text-sm">
            Add company
          </Link>
          <Link href="/dashboard" className="btn btn-secondary text-sm">
            Dashboard
          </Link>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="display text-2xl text-ink">No limited companies yet</p>
          <p className="mt-2 text-ink-soft">
            Add a limited company client to open its secretarial desk.
          </p>
          <Link href="/clients/new" className="btn btn-primary mt-6 text-sm">
            Add limited company
          </Link>
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => {
            const ch =
              "companiesHouse" in c
                ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
                : null;
            const slug = clientSlugFor({ id: c.id, name: c.name }, peers);
            return (
              <SecretarialCompanyCard
                key={c.id}
                href={`/company-secretarial/${slug}`}
                name={c.name}
                companyNumber={c.companyNumber ?? ch?.companyNumber ?? null}
                status={ch?.companyStatus ?? null}
                addressSnippet={
                  ch?.registeredOffice?.trim() || c.address?.trim() || null
                }
                confirmationDue={formatDueShort(
                  ch?.confirmationStatementNextDue ?? null,
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
