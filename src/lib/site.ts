/** Production canonical — never use localhost in sitemaps or Open Graph. */
export const CANONICAL_SITE_URL = "https://hydratax.uk";

export function siteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (
    fromEnv &&
    !fromEnv.includes("localhost") &&
    !fromEnv.includes("127.0.0.1")
  ) {
    return fromEnv;
  }
  return CANONICAL_SITE_URL;
}
