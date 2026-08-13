import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  YearEndFilingForm,
  type YearEndFilingMode,
} from "@/components/forms/year-end-filing-form";
import {
  getCompanyOfficers,
  getCompanyProfile,
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";

function parseMode(raw: string | undefined): YearEndFilingMode {
  if (raw === "accounts" || raw === "both" || raw === "ct600") return raw;
  return "accounts";
}

function formatAddress(addr?: Record<string, string | undefined> | null) {
  if (!addr) return null;
  return (
    [
      addr.address_line_1,
      addr.address_line_2,
      addr.locality,
      addr.region,
      addr.postal_code,
      addr.country,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const query = await searchParams;
  const company = query.company?.trim().toUpperCase();
  return {
    title: company
      ? `Enter Details — ${company} · Year-end filing`
      : "Year-end filing — Companies House",
  };
}

export default async function PublicYearEndFilingPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    company?: string;
    clientId?: string;
  }>;
}) {
  const query = await searchParams;
  const companyNumber = query.company?.trim().toUpperCase() || null;
  const mode = parseMode(query.mode);

  // Practice desk deep-link with clientId → use the authenticated client route
  if (query.clientId && companyNumber) {
    redirect(
      `/clients/${encodeURIComponent(query.clientId)}/year-end?mode=${mode}&company=${encodeURIComponent(companyNumber)}`,
    );
  }
  if (query.clientId) {
    redirect(
      `/clients/${encodeURIComponent(query.clientId)}/year-end?mode=${mode}`,
    );
  }

  if (!companyNumber) {
    redirect("/companies-house/accounts-ixbrl");
  }

  if (!isCompaniesHouseApiConfigured()) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="display text-3xl text-ink">Year-end filing</h1>
          <p className="mt-3 text-ink-soft">
            Set <code className="mono">COMPANIES_HOUSE_API_KEY</code> to load
            company details and filed accounts for this flow.
          </p>
          <Link
            href={`/companies-house/company/${encodeURIComponent(companyNumber)}`}
            className="btn btn-secondary mt-6 inline-flex"
          >
            ← Back to company hub
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const [profile, officers, chFiling] = await Promise.all([
    getCompanyProfile(companyNumber).catch(() => null),
    getCompanyOfficers(companyNumber).catch(() => []),
    getLastAccountsFiling(companyNumber).catch(() => null),
  ]);

  if (!profile) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="display text-3xl text-ink">Company not found</h1>
          <p className="mt-3 text-ink-soft">
            Companies House did not return a profile for {companyNumber}.
          </p>
          <Link
            href="/companies-house"
            className="btn btn-secondary mt-6 inline-flex"
          >
            ← Search again
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const directors = officers
    .filter((o) => !o.resigned_on)
    .filter((o) => /director/i.test(o.officer_role ?? "director"))
    .map((o) => o.name)
    .filter(Boolean);

  const defaultPeriodEnd =
    profile.accounts?.next_accounts?.period_end_on?.slice(0, 10) ||
    (profile.accounts?.last_accounts?.made_up_to
      ? shiftYear(profile.accounts.last_accounts.made_up_to, 1)
      : null);

  const accountsCheckoutHref = `/companies-house/accounts-ixbrl?company=${encodeURIComponent(companyNumber)}&pay=1`;
  const chPreviewUrl = chFiling?.documentMetadataUrl
    ? `/api/companies-house/document?company=${encodeURIComponent(companyNumber)}`
    : null;

  const returnPath = `/companies-house/year-end?mode=${mode}&company=${encodeURIComponent(companyNumber)}&resume=1`;
  const signInHref = `/sign-in?next=${encodeURIComponent(`${returnPath}&step=submit`)}`;

  const persistKey = companyNumber
    ? `hydratax_year_end_figures_${companyNumber}`
    : undefined;

  return (
    <div className="min-h-screen bg-sand/20">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/companies-house/company/${encodeURIComponent(companyNumber)}`}
            className="text-sm font-semibold text-sea hover:underline"
          >
            ← Back to {profile.company_name}
          </Link>
          <Link
            href={`/companies-house/accounts-ixbrl?company=${encodeURIComponent(companyNumber)}`}
            className="text-sm text-ink-soft hover:text-ink"
          >
            Change filing choice
          </Link>
        </div>

        <Suspense
          fallback={
            <p className="text-sm text-ink-soft">Loading year-end filing…</p>
          }
        >
          <YearEndFilingForm
            initialMode={mode}
            lockFilingMode
            persistKey={persistKey}
            postSignInPath={returnPath}
            company={{
              name: profile.company_name,
              companyNumber: profile.company_number,
              registeredOffice: formatAddress(profile.registered_office_address),
              companyStatus: profile.company_status ?? null,
              sicCodes: profile.sic_codes ?? [],
              directors: directors.length ? directors : ["Director"],
              incorporatedOn: profile.date_of_creation ?? null,
              accountsNextDue: profile.accounts?.next_due ?? null,
            }}
            defaultPeriodEnd={defaultPeriodEnd}
            accountsCheckoutHref={accountsCheckoutHref}
            signInHref={signInHref}
            lastFiledAccounts={
              chFiling
                ? {
                    description: chFiling.description,
                    filedOn: chFiling.filedOn,
                    madeUpTo: chFiling.madeUpTo,
                    pages: chFiling.pages,
                    registerUrl: chFiling.registerUrl,
                    companyFilingHistoryUrl: chFiling.companyFilingHistoryUrl,
                    chPreviewUrl,
                  }
                : {
                    description: "Accounts on Companies House",
                    filedOn: null,
                    madeUpTo: null,
                    pages: null,
                    registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts`,
                    companyFilingHistoryUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts`,
                    chPreviewUrl: `/api/companies-house/document?company=${encodeURIComponent(companyNumber)}`,
                  }
            }
          />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

function shiftYear(iso: string, delta: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}
