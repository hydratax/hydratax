import { SIC_CODES } from "@/lib/sic-codes";
import { companyProfilePath } from "@/lib/company-slug";

/** Popular industry hubs for SEO browse + sitemap. */
export const SEO_INDUSTRY_HUBS: Array<{ sic: string; label: string }> = [
  { sic: "86101", label: "Healthcare" },
  { sic: "62012", label: "Software development" },
  { sic: "62020", label: "IT consultancy" },
  { sic: "69201", label: "Accounting" },
  { sic: "70229", label: "Management consultancy" },
  { sic: "68310", label: "Real estate agencies" },
  { sic: "68209", label: "Property letting" },
  { sic: "56101", label: "Restaurants" },
  { sic: "41202", label: "Domestic construction" },
  { sic: "43210", label: "Electrical installation" },
  { sic: "47910", label: "Online retail" },
  { sic: "49320", label: "Taxi / private hire" },
  { sic: "85590", label: "Other education" },
  { sic: "96020", label: "Hairdressing" },
  { sic: "86900", label: "Other human health" },
];

/** Popular UK towns/cities for location hub pages. */
export const SEO_LOCATION_HUBS = [
  "London",
  "Manchester",
  "Birmingham",
  "Leeds",
  "Glasgow",
  "Edinburgh",
  "Bristol",
  "Liverpool",
  "Sheffield",
  "Leicester",
  "Nottingham",
  "Cardiff",
  "Belfast",
  "Luton",
  "Reading",
  "Cambridge",
  "Oxford",
  "Brighton",
  "Coventry",
  "Newcastle",
] as const;

export function industryHubPath(sic: string) {
  return `/companies/industry/${encodeURIComponent(sic.replace(/\D/g, "").slice(0, 5))}`;
}

export function locationHubPath(location: string) {
  const slug = location
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `/companies/in/${encodeURIComponent(slug)}`;
}

export function locationFromSlug(slug: string) {
  const decoded = decodeURIComponent(slug).trim();
  if (!decoded) return null;
  return decoded
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function sicLabel(sic: string | null | undefined): string {
  if (!sic) return "Industry";
  const code = sic.replace(/\D/g, "").slice(0, 5);
  const known = SIC_CODES.find((s) => s.code === code);
  if (known) return known.description;
  const hub = SEO_INDUSTRY_HUBS.find((h) => h.sic === code);
  if (hub) return hub.label;
  return `SIC ${code}`;
}

export function shortSicLabel(sic: string | null | undefined): string {
  if (!sic) return "Industry";
  const code = sic.replace(/\D/g, "").slice(0, 5);
  const hub = SEO_INDUSTRY_HUBS.find((h) => h.sic === code);
  if (hub) return hub.label;
  const known = SIC_CODES.find((s) => s.code === code);
  if (known) {
    const first = known.description.split(/[;,]/)[0]?.trim();
    return first && first.length <= 40 ? first : `SIC ${code}`;
  }
  return `SIC ${code}`;
}

export type DirectoryCompanyLink = {
  companyNumber: string;
  title: string;
  href: string;
  status?: string;
  addressSnippet?: string;
};

export function toDirectoryLinks(
  items: Array<{
    company_number: string;
    title: string;
    company_status?: string;
    address_snippet?: string;
  }>,
  excludeNumber?: string,
): DirectoryCompanyLink[] {
  const exclude = (excludeNumber ?? "").toUpperCase();
  return items
    .filter((i) => i.company_number?.toUpperCase() !== exclude)
    .map((i) => ({
      companyNumber: i.company_number,
      title: i.title,
      href: companyProfilePath(i.title, i.company_number),
      status: i.company_status,
      addressSnippet: i.address_snippet,
    }));
}
