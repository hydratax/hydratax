import type { MetadataRoute } from "next";
import { cache } from "react";
import {
  COMPANY_SITEMAP_HUB_SAMPLE,
  COMPANY_SITEMAP_SHARD_SIZE,
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

const collectSeedCompanies = cache(async (): Promise<SitemapCompany[]> => {
  if (!isCompaniesHouseApiConfigured()) return [];

  const byNumber = new Map<string, SitemapCompany>();
  const queries = hubSeedQueries();

  // Sequential to stay polite with Companies House rate limits.
  for (const q of queries) {
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

export async function generateSitemaps() {
  const companies = await collectSeedCompanies();
  const shardCount = Math.max(
    1,
    Math.ceil(companies.length / COMPANY_SITEMAP_SHARD_SIZE),
  );
  return Array.from({ length: shardCount }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<number> | number;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  const companies = await collectSeedCompanies();
  const start = id * COMPANY_SITEMAP_SHARD_SIZE;
  const slice = companies.slice(start, start + COMPANY_SITEMAP_SHARD_SIZE);
  const SITE = siteUrl();
  const now = new Date();

  return slice.map((c) => ({
    url: `${SITE}${c.href}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}
