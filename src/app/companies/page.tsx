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
    <div className="min-h-screen company-profile">
      <SiteHeader />
      <main>
        <header className="company-profile-hero relative overflow-hidden border-b border-line/70">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(15,118,110,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.055) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage:
                "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 58% 28%, rgba(15,118,110,0.14), transparent 58%), linear-gradient(165deg, #f4fbfa 0%, #f7f9fa 45%, #eef7f6 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pb-14 md:pt-10">
            <nav className="text-sm text-ink-soft">
              <Link href="/" className="font-semibold text-sea hover:underline">
                Home
              </Link>
              <span className="mx-2 text-line">/</span>
              <span className="text-ink">Companies</span>
            </nav>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.75fr)] lg:items-stretch">
              <div className="company-profile-hero-copy">
                <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                  Companies House · HydraTax
                </p>
                <h1 className="display mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight text-ink">
                  Find any UK company
                </h1>
                <p className="mt-4 max-w-xl text-base text-ink-soft">
                  Look up accounts, CT600 and confirmation statement dates —
                  then file yourself through HydraTax.
                </p>
              </div>

              <div className="company-profile-actions gloss-card relative flex flex-col justify-center overflow-hidden rounded-2xl border border-sea/25 bg-white/90 p-6 shadow-[0_20px_50px_-28px_rgba(15,118,110,0.35)]">
                <div className="gloss-shine" aria-hidden />
                <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                  File with HydraTax
                </p>
                <p className="relative mt-2 text-sm text-ink-soft">
                  Already know the filing? Jump straight in.
                </p>
                <div className="relative mt-5 flex flex-col gap-2.5">
                  <Link
                    href="/companies-house/confirmation-statement"
                    className="btn btn-primary company-cta-primary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                  >
                    Confirmation statement
                  </Link>
                  <Link
                    href="/companies-house/accounts-ixbrl"
                    className="btn btn-secondary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5"
                  >
                    Annual accounts
                  </Link>
                  <Link
                    href="/companies-house/incorporation"
                    className="pt-1 text-center text-sm font-semibold text-sea transition hover:text-sea-deep"
                  >
                    Incorporate a company →
                  </Link>
                </div>
              </div>
            </div>

            <div className="company-profile-body relative mt-10">
              <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 md:p-6 shadow-[0_18px_40px_-28px_rgba(15,118,110,0.28)]">
                <div className="gloss-shine" aria-hidden />
                <div className="relative">
                  <CompanySearchPanel
                    variant="embedded"
                    heading="Search Companies House"
                    description="Start typing a company name or number — open the profile to see deadlines."
                    selectTarget="hub"
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="border-b border-line/70 bg-gradient-to-b from-white to-[#f7fbfa]">
          <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
            <div className="mb-5">
              <h2 className="display text-2xl text-ink md:text-3xl">
                Browse by industry
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Active companies grouped by SIC — open a hub, then a company
                profile.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SEO_INDUSTRY_HUBS.map((hub, i) => (
                <li key={hub.sic}>
                  <Link
                    href={industryHubPath(hub.sic)}
                    className="company-deadline-tile gloss-card group relative block overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
                    style={{ animationDelay: `${0.04 + i * 0.03}s` }}
                  >
                    <div className="gloss-shine" aria-hidden />
                    <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                      SIC {hub.sic}
                    </p>
                    <p className="display relative mt-3 text-2xl text-ink transition group-hover:text-sea-deep">
                      {hub.label}
                    </p>
                    <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-sea transition group-hover:gap-2">
                      View companies
                      <span aria-hidden>→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="mb-5">
            <h2 className="display text-2xl text-ink md:text-3xl">
              Browse by location
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Companies with a registered office in major UK places.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEO_LOCATION_HUBS.map((place, i) => (
              <li key={place}>
                <Link
                  href={locationHubPath(place)}
                  className="company-deadline-tile gloss-card group relative block overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
                  style={{ animationDelay: `${0.04 + i * 0.025}s` }}
                >
                  <div className="gloss-shine" aria-hidden />
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                    Registered office
                  </p>
                  <p className="display relative mt-3 text-2xl text-ink transition group-hover:text-sea-deep">
                    {place}
                  </p>
                  <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-sea transition group-hover:gap-2">
                    View companies
                    <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
