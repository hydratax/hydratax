import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import {
  industryHubPath,
  locationHubPath,
  SEO_INDUSTRY_HUBS,
  SEO_LOCATION_HUBS,
} from "@/lib/company-directory";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "UK company directory — find any Companies House company",
  description:
    "Search any UK limited company on Companies House. See accounts and confirmation statement due dates, then file CT600, accounts or CS01 with HydraTax.",
  alternates: { canonical: `${siteUrl()}/companies` },
  openGraph: {
    title: "UK company directory — HydraTax",
    description:
      "Search Companies House companies and file confirmation statements, accounts and CT600 online.",
    url: `${siteUrl()}/companies`,
  },
};

export default function CompaniesDirectoryPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <section className="border-b border-line bg-ink px-4 py-14 text-white md:px-6 md:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">
              Companies House directory
            </p>
            <h1 className="display mt-3 text-4xl md:text-5xl">
              Find any UK company
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Look up due dates for accounts, CT600 and confirmation statements —
              then file yourself through HydraTax.
            </p>
            <div className="mt-8">
              <CompanySearchPanel
                variant="hero"
                heading="Search by company name or number"
                description={null}
                selectTarget="hub"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <h2 className="display text-2xl text-ink">Browse by industry</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Active companies grouped by SIC code — open a profile to file.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEO_INDUSTRY_HUBS.map((hub) => (
              <li key={hub.sic}>
                <Link
                  href={industryHubPath(hub.sic)}
                  className="block rounded-2xl border border-line bg-white px-4 py-4 transition hover:border-sea/40"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wide text-sea">
                    SIC {hub.sic}
                  </span>
                  <span className="mt-1 block font-semibold text-ink">
                    {hub.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line bg-white/70">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
            <h2 className="display text-2xl text-ink">Browse by location</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Companies registered in major UK towns and cities.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {SEO_LOCATION_HUBS.map((place) => (
                <li key={place}>
                  <Link
                    href={locationHubPath(place)}
                    className="inline-flex rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-sea/40"
                  >
                    {place}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
