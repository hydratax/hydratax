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
import {
  isDirectoryDbAvailable,
  listCompaniesFromDirectoryDb,
} from "@/server/companies-house/directory-db";

export const revalidate = 86_400;

/**
 * Single company sitemap at /company/sitemap.xml (seeded from industry/location hubs).
 * Prefers local Basic Company Data SQLite when present (no CH API). Falls back to API.
 * When coverage grows past ~45k URLs, use `npm run ch:generate-sitemaps` shards.
 */
const collectSeedCompanies = cache(async (): Promise<SitemapCompany[]> => {
  const byNumber = new Map<string, SitemapCompany>();

  if (isDirectoryDbAvailable()) {
    for (const q of hubSeedQueries()) {
      const rows = listCompaniesFromDirectoryDb({
        sicCode: q.sic,
        location: q.location,
        size: COMPANY_SITEMAP_HUB_SAMPLE,
      });
      for (const row of rows ?? []) {
        if (!byNumber.has(row.companyNumber)) {
          byNumber.set(row.companyNumber, {
            companyNumber: row.companyNumber,
            title: row.title,
            href: row.href,
          });
        }
      }
    }
    if (byNumber.size > 0) {
      return Array.from(byNumber.values()).sort((a, b) =>
        a.companyNumber.localeCompare(b.companyNumber),
      );
    }
  }

  if (!isCompaniesHouseApiConfigured()) return [];

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
