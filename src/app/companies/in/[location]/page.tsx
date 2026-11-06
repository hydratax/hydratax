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
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <nav className="text-sm text-ink-soft">
          <Link href="/" className="font-semibold text-sea">
            Home
          </Link>
          <span> / </span>
          <Link href="/companies" className="font-semibold text-sea">
            Companies
          </Link>
          <span> / </span>
          <span className="text-ink">{place}</span>
        </nav>

        <h1 className="display mt-4 text-4xl text-ink md:text-5xl">
          Companies in {place}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Active companies with a registered office in {place}. Open a profile to
          see filing deadlines and start a confirmation statement, accounts or
          CT600.
        </p>

        {companies.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">
            No companies returned for {place} right now. Try the{" "}
            <Link href="/companies" className="font-semibold text-sea">
              company search
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-8 grid gap-2 sm:grid-cols-2">
            {companies.map((c) => (
              <li key={c.companyNumber}>
                <Link
                  href={c.href}
                  className="block rounded-xl border border-line bg-white px-4 py-3 transition hover:border-sea/40"
                >
                  <span className="font-semibold text-ink line-clamp-1">
                    {c.title}
                  </span>
                  <span className="mt-1 block mono text-xs text-ink-soft">
                    {c.companyNumber}
                    {c.addressSnippet ? ` · ${c.addressSnippet}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
