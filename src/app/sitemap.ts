import type { MetadataRoute } from "next";
import { SUPPORT_ARTICLES, SUPPORT_CATEGORIES } from "@/lib/support-content";
import { BLOG_POSTS } from "@/lib/blog";
import { CH_SERVICE_DETAILS } from "@/lib/ch-services";
import {
  industryHubPath,
  locationHubPath,
  SEO_INDUSTRY_HUBS,
  SEO_LOCATION_HUBS,
} from "@/lib/company-directory";
import { siteUrl } from "@/lib/site";

const SITE = siteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const weekly: Array<{ path: string; priority: number }> = [
    { path: "", priority: 1 },
    { path: "/pricing", priority: 0.95 },
    { path: "/companies", priority: 0.96 },
    { path: "/companies-house", priority: 0.95 },
    { path: "/blog", priority: 0.9 },
    { path: "/companies-house/incorporation", priority: 0.85 },
    { path: "/companies-house/confirmation-statement", priority: 0.85 },
    { path: "/companies-house/accounts-ixbrl", priority: 0.85 },
    { path: "/support", priority: 0.75 },
    { path: "/book-demo", priority: 0.88 },
  ];

  const monthly = [
    "/companies-house/personal-code",
    "/feature-requests",
    "/contact",
    "/create-account",
    "/terms",
    "/privacy",
    "/legal/dpa",
    ...CH_SERVICE_DETAILS.filter(
      (s) =>
        s.id !== "incorporation" &&
        s.id !== "confirmation-statement" &&
        s.id !== "accounts-ixbrl",
    ).map((s) => `/companies-house/${s.id}`),
    ...SUPPORT_CATEGORIES.map((c) => `/support/category/${c.id}`),
    ...SUPPORT_ARTICLES.map((a) => `/support/${a.slug}`),
  ];

  const directoryHubs = [
    ...SEO_INDUSTRY_HUBS.map((h) => industryHubPath(h.sic)),
    ...SEO_LOCATION_HUBS.map((place) => locationHubPath(place)),
  ];

  const now = new Date();

  return [
    ...weekly.map(({ path, priority }) => ({
      url: `${SITE}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority,
    })),
    ...directoryHubs.map((path) => ({
      url: `${SITE}${path}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...BLOG_POSTS.map((post) => ({
      url: `${SITE}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.86,
    })),
    ...monthly.map((path) => ({
      url: `${SITE}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
  ];
}
