import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
