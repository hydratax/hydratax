import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  locationFromSlug,
  locationHubPath,
  SEO_LOCATION_HUBS,
} from "@/lib/company-directory";
import { siteUrl } from "@/lib/site";
import { isCompaniesHouseApiConfigured } from "@/server/companies-house/api";
import { listCompaniesForHub } from "@/server/companies-house/similar-companies";

export const revalidate = 86_400;

export async function generateStaticParams() {
  return SEO_LOCATION_HUBS.map((location) => ({
    location: location.toLowerCase(),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const { location: raw } = await params;
  const place = locationFromSlug(raw);
  if (!place) return { title: "Companies by location — HydraTax" };
  const title = `Companies in ${place} — Companies House directory`;
  const description = `Browse active UK companies registered in ${place}. Check accounts and confirmation statement due dates, then file with HydraTax.`;
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl()}${locationHubPath(place)}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl()}${locationHubPath(place)}`,
    },
  };
}

export default async function LocationHubPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location: raw } = await params;
  const place = locationFromSlug(raw);
  if (!place || !isCompaniesHouseApiConfigured()) notFound();

  const companies = await listCompaniesForHub({ location: place, size: 48 });

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
                "radial-gradient(ellipse 70% 55% at 45% 28%, rgba(15,118,110,0.14), transparent 58%), linear-gradient(165deg, #f4fbfa 0%, #f7f9fa 45%, #eef7f6 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-8 md:px-6 md:pb-12 md:pt-10">
            <nav className="text-sm text-ink-soft">
              <Link href="/" className="font-semibold text-sea hover:underline">
                Home
              </Link>
              <span className="mx-2 text-line">/</span>
              <Link
                href="/companies"
                className="font-semibold text-sea hover:underline"
              >
                Companies
              </Link>
              <span className="mx-2 text-line">/</span>
              <span className="text-ink">{place}</span>
            </nav>

            <div className="company-profile-hero-copy mt-8 max-w-3xl">
              <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                Location · Companies House
              </p>
              <h1 className="display mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight text-ink">
                Companies in {place}
              </h1>
              <p className="mt-4 max-w-2xl text-base text-ink-soft">
                Active companies with a registered office in {place}. Open a
                profile to see filing deadlines and start a confirmation
                statement, accounts or CT600.
              </p>
            </div>
          </div>
        </header>

        <section className="border-b border-line/70 bg-gradient-to-b from-white to-[#f7fbfa]">
          <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
            {companies.length === 0 ? (
              <p className="text-sm text-ink-soft">
                No companies returned for {place} right now. Try the{" "}
                <Link href="/companies" className="font-semibold text-sea">
                  company search
                </Link>
                .
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {companies.map((c, i) => (
                  <li key={c.companyNumber}>
                    <Link
                      href={c.href}
                      className="company-deadline-tile gloss-card group relative block overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
                      style={{ animationDelay: `${0.04 + i * 0.02}s` }}
                    >
                      <div className="gloss-shine" aria-hidden />
                      <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                        {c.companyNumber}
                      </p>
                      <p className="display relative mt-3 text-xl text-ink transition group-hover:text-sea-deep sm:text-2xl">
                        {c.title}
                      </p>
                      {c.addressSnippet ? (
                        <p className="relative mt-2 text-sm text-ink-soft line-clamp-2">
                          {c.addressSnippet}
                        </p>
                      ) : null}
                      <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-sea transition group-hover:gap-2">
                        Open profile
                        <span aria-hidden>→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
