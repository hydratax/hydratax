import type { MetadataRoute } from "next";
import { SUPPORT_ARTICLES, SUPPORT_CATEGORIES } from "@/lib/support-content";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.co.uk";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    "",
    "/pricing",
    "/companies-house",
    "/support",
    "/dashboard",
    "/clients",
    "/sign-in",
    "/sign-up",
  ];

  const support = [
    ...SUPPORT_CATEGORIES.map((c) => `/support/category/${c.id}`),
    ...SUPPORT_ARTICLES.map((a) => `/support/${a.slug}`),
  ];

  return [...staticPaths, ...support].map((path) => ({
    url: `${SITE}${path}`,
    lastModified: new Date(),
    changeFrequency:
      path === "" || path === "/pricing" || path === "/companies-house"
        ? "weekly"
        : "monthly",
    priority:
      path === ""
        ? 1
        : path === "/pricing" || path === "/companies-house"
          ? 0.95
          : path.startsWith("/support")
            ? 0.8
            : 0.65,
  }));
}
