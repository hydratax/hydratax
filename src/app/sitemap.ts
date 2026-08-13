import type { MetadataRoute } from "next";
import { SUPPORT_ARTICLES, SUPPORT_CATEGORIES } from "@/lib/support-content";
import { BLOG_POSTS } from "@/lib/blog";
import { CH_SERVICE_DETAILS } from "@/lib/ch-services";
import { siteUrl } from "@/lib/site";

const SITE = siteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const weekly: Array<{ path: string; priority: number }> = [
    { path: "", priority: 1 },
    { path: "/pricing", priority: 0.95 },
    { path: "/companies-house", priority: 0.95 },
    { path: "/blog", priority: 0.9 },
    { path: "/companies-house/incorporation", priority: 0.85 },
    { path: "/companies-house/confirmation-statement", priority: 0.85 },
    { path: "/companies-house/accounts-ixbrl", priority: 0.85 },
    { path: "/support", priority: 0.75 },
  ];

  const monthly = [
    "/companies-house/personal-code",
    "/feature-requests",
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

  const now = new Date();

  return [
    ...weekly.map(({ path, priority }) => ({
      url: `${SITE}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority,
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
