import Link from "next/link";
import { redirect } from "next/navigation";
import { SecretarialCompanyList } from "@/components/company-secretarial/secretarial-company-list";
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

  const companyItems = companies.map((c) => {
    const ch =
      "companiesHouse" in c
        ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
        : null;
    const slug = clientSlugFor({ id: c.id, name: c.name }, peers);
    return {
      href: `/company-secretarial/${slug}`,
      name: c.name,
      companyNumber: c.companyNumber ?? ch?.companyNumber ?? null,
      status: ch?.companyStatus ?? null,
      addressSnippet:
        ch?.registeredOffice?.trim() || c.address?.trim() || null,
      confirmationDue: formatDueShort(
        ch?.confirmationStatementNextDue ?? null,
      ),
    };
  });

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
        </div>
        <Link href="/clients/new" className="btn btn-secondary text-sm">
          Add company
        </Link>
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
        <SecretarialCompanyList companies={companyItems} />
      )}
    </div>
  );
}
