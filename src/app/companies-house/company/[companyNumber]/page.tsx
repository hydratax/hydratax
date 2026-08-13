import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CompanyHub } from "@/components/companies-house/company-hub";
import {
  isCompaniesHouseApiConfigured,
  lookupCompanyBundle,
} from "@/server/companies-house/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyNumber: string }>;
}) {
  const { companyNumber } = await params;
  return {
    title: `${companyNumber.toUpperCase()} — Companies House · HydraTax`,
    description: `Company hub for ${companyNumber}: confirmation statement, accounts, and other Companies House filings.`,
  };
}

export default async function CompanyHubPage({
  params,
}: {
  params: Promise<{ companyNumber: string }>;
}) {
  const { companyNumber: raw } = await params;
  const companyNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(companyNumber)) notFound();

  if (!isCompaniesHouseApiConfigured()) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-16 text-center md:px-6">
          <h1 className="display text-3xl text-ink">Companies House API</h1>
          <p className="mt-3 text-ink-soft">
            Add <code className="mono">COMPANIES_HOUSE_API_KEY</code> to load
            live company data.
          </p>
          <Link href="/companies-house" className="btn btn-primary mt-8">
            Back to search
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  let bundle: Awaited<ReturnType<typeof lookupCompanyBundle>>;
  try {
    bundle = await lookupCompanyBundle(companyNumber);
  } catch {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-16 text-center md:px-6">
          <h1 className="display text-3xl text-ink">Company not found</h1>
          <p className="mt-3 text-ink-soft">
            We could not load {companyNumber} from Companies House.
          </p>
          <Link href="/companies-house" className="btn btn-primary mt-8">
            Search again
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const registerUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <CompanyHub
          profile={bundle.profile}
          officers={bundle.officers}
          pscs={bundle.pscs}
          registerUrl={registerUrl}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
