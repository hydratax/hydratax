import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  industryHubPath,
  shortSicLabel,
  sicLabel,
  SEO_INDUSTRY_HUBS,
} from "@/lib/company-directory";
import { siteUrl } from "@/lib/site";
import { isCompaniesHouseApiConfigured } from "@/server/companies-house/api";
import { listCompaniesForHub } from "@/server/companies-house/similar-companies";

export const revalidate = 86_400;

export async function generateStaticParams() {
  return SEO_INDUSTRY_HUBS.map((h) => ({ sic: h.sic }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sic: string }>;
}): Promise<Metadata> {
  const { sic: raw } = await params;
  const sic = raw.replace(/\D/g, "").slice(0, 5);
  if (!sic) return { title: "Industry companies — HydraTax" };
  const label = shortSicLabel(sic);
  const title = `${label} companies UK (SIC ${sic})`;
  const description = `Browse active UK ${label.toLowerCase()} companies (SIC ${sic}). See Companies House due dates and file confirmation statements, accounts or CT600 with HydraTax.`;
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl()}${industryHubPath(sic)}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl()}${industryHubPath(sic)}`,
    },
  };
}

export default async function IndustryHubPage({
  params,
}: {
  params: Promise<{ sic: string }>;
}) {
  const { sic: raw } = await params;
  const sic = raw.replace(/\D/g, "").slice(0, 5);
  if (sic.length < 4 || !isCompaniesHouseApiConfigured()) notFound();

  const label = shortSicLabel(sic);
  const fullLabel = sicLabel(sic);
  const companies = await listCompaniesForHub({ sicCode: sic, size: 48 });

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
          <span className="text-ink">{label}</span>
        </nav>

        <h1 className="display mt-4 text-4xl text-ink md:text-5xl">
          {label} companies
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Active Companies House companies under SIC {sic}
          {fullLabel !== label ? ` (${fullLabel})` : ""}. Open a company to see
          accounts and confirmation statement dates, then file online.
        </p>

        {companies.length === 0 ? (
          <p className="mt-8 text-sm text-ink-soft">
            No companies returned for this SIC right now. Try the{" "}
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
