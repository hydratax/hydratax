import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const SITE = siteUrl();

/** AI / SEO scrapers that burn Companies House quota without sending customers. */
const DIRECTORY_SCRAPER_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "meta-externalagent",
  "Applebot-Extended",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "ExaSearchBot",
] as const;

const DIRECTORY_PATHS = ["/company/", "/companies/industry/", "/companies/in/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/clients",
          "/settings",
          "/admin",
          "/filings",
          "/checkout",
        ],
      },
      ...DIRECTORY_SCRAPER_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DIRECTORY_PATHS,
      })),
    ],
    // Both must return application/xml without an auth redirect.
    sitemap: [`${SITE}/sitemap.xml`, `${SITE}/company/sitemap.xml`],
    host: SITE,
  };
}
