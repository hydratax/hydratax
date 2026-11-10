import type { MetadataRoute } from "next";
import { cache } from "react";
import {
  COMPANY_SITEMAP_HUB_SAMPLE,
  hubSeedQueries,
  toSitemapCompany,
  type SitemapCompany,
} from "@/lib/company-seo";
import { siteUrl } from "@/lib/site";
import {
  advancedSearchCompanies,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";

export const revalidate = 86_400;

/**
 * Single company sitemap at /company/sitemap.xml (seeded from industry/location hubs).
 * When coverage grows past ~45k URLs, switch back to generateSitemaps shards + an index.
 */
const collectSeedCompanies = cache(async (): Promise<SitemapCompany[]> => {
  if (!isCompaniesHouseApiConfigured()) return [];

  const byNumber = new Map<string, SitemapCompany>();
  for (const q of hubSeedQueries()) {
    try {
      const items = await advancedSearchCompanies({
        sicCodes: q.sic ? [q.sic] : undefined,
        location: q.location,
        companyStatus: ["active"],
        size: COMPANY_SITEMAP_HUB_SAMPLE,
        revalidate: 86_400,
      });
      for (const item of items) {
        if (!item.company_number || !item.title) continue;
        const row = toSitemapCompany(item);
        if (!byNumber.has(row.companyNumber)) {
          byNumber.set(row.companyNumber, row);
        }
      }
    } catch {
      // Skip a hub that fails — other hubs still seed the sitemap.
    }
  }

  return Array.from(byNumber.values()).sort((a, b) =>
    a.companyNumber.localeCompare(b.companyNumber),
  );
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const companies = await collectSeedCompanies();
  const SITE = siteUrl();
  const now = new Date();

  return companies.map((c) => ({
    url: `${SITE}${c.href}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}
