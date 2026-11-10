/**
 * Company-directory SEO strategy (TinyTax-style).
 *
 * Goal: when someone Googles a UK company name / number, HydraTax’s
 * `/company/{slug}-{number}` page ranks near the top alongside Companies House.
 *
 * How TinyTax wins (and what we mirror):
 * 1. One indexable URL per company — `/company/name-15863077`
 * 2. Hub pages that link out — industry + location directories
 * 3. Sitemap index with sharded company sitemaps (~50k URLs each)
 * 4. Rich on-page facts + FAQ / Organization JSON-LD
 * 5. ISR/caching so crawls do not hammer Companies House
 * 6. Block AI scrapers on the directory (save CH quota for Google/Bing)
 *
 * HydraTax rollout:
 * Phase A (shipped here): hubs + profile pages + FAQ schema + AI-bot robots
 *   rules + company sitemap shards seeded from hub searches.
 * Phase B: persist every viewed/searched company → growing sitemap coverage.
 * Phase C: import Companies House bulk/basic data → full ~5M URL shards + IndexNow.
 * Phase D: Search Console monitoring, internal-link refresh, freshness signals
 *   (accounts due / CS due) on titles where useful.
 */

import { companyProfilePath } from "@/lib/company-slug";
import {
  SEO_INDUSTRY_HUBS,
  SEO_LOCATION_HUBS,
} from "@/lib/company-directory";

/** Max URLs per company sitemap shard (Google soft limit is 50k). */
export const COMPANY_SITEMAP_SHARD_SIZE = 5_000;

/** How many companies to pull per hub when seeding the sitemap. */
export const COMPANY_SITEMAP_HUB_SAMPLE = 100;

export type SitemapCompany = {
  companyNumber: string;
  title: string;
  href: string;
};

export function companyOrganizationJsonLd(opts: {
  name: string;
  companyNumber: string;
  url: string;
  address?: string | null;
  statusLabel?: string;
  foundingDate?: string | null;
  industry?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts.name,
    legalName: opts.name,
    url: opts.url,
    identifier: opts.companyNumber,
    ...(opts.foundingDate ? { foundingDate: opts.foundingDate } : {}),
    ...(opts.industry ? { industry: opts.industry } : {}),
    ...(opts.statusLabel
      ? { description: `${opts.name} is ${opts.statusLabel.toLowerCase()} on the UK Companies House register (${opts.companyNumber}).` }
      : {}),
    ...(opts.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: opts.address,
            addressCountry: "GB",
          },
        }
      : {}),
  };
}

export function hubSeedQueries(): Array<{ sic?: string; location?: string }> {
  return [
    ...SEO_INDUSTRY_HUBS.map((h) => ({ sic: h.sic })),
    ...SEO_LOCATION_HUBS.map((place) => ({ location: place })),
  ];
}

export function toSitemapCompany(item: {
  company_number: string;
  title: string;
}): SitemapCompany {
  return {
    companyNumber: item.company_number,
    title: item.title,
    href: companyProfilePath(item.title, item.company_number),
  };
}
