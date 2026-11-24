import {
  advancedSearchCompanies,
  searchCompanies,
  type ChSearchItem,
} from "@/server/companies-house/api";
import { listCompaniesFromDirectoryDb } from "@/server/companies-house/directory-db";
import {
  shortSicLabel,
  toDirectoryLinks,
  type DirectoryCompanyLink,
} from "@/lib/company-directory";

async function advancedOrEmpty(
  opts: Parameters<typeof advancedSearchCompanies>[0],
): Promise<ChSearchItem[]> {
  try {
    return await advancedSearchCompanies(opts);
  } catch (err) {
    console.warn(
      "[ch.advanced]",
      err instanceof Error ? err.message : "advanced search failed",
    );
    return [];
  }
}

/** Name-search fallback when advanced search is empty or rate-limited. */
async function nameSearchFallback(opts: {
  sicCode?: string;
  location?: string;
  size: number;
}): Promise<ChSearchItem[]> {
  const label = opts.sicCode ? shortSicLabel(opts.sicCode) : null;
  const place = opts.location?.trim() || null;
  const queries = [
    [place, label].filter(Boolean).join(" ").trim(),
    label,
    place,
  ].filter((q): q is string => Boolean(q && q.length >= 2));

  const seen = new Set<string>();
  const out: ChSearchItem[] = [];
  for (const q of queries) {
    if (out.length >= opts.size) break;
    const page = await searchCompanies(q, Math.min(opts.size, 50)).catch(
      () => [] as ChSearchItem[],
    );
    for (const item of page) {
      const n = (item.company_number ?? "").toUpperCase();
      if (!n || seen.has(n)) continue;
      if (
        place &&
        !(item.address_snippet ?? "").toLowerCase().includes(place.toLowerCase())
      ) {
        continue;
      }
      seen.add(n);
      out.push(item);
    }
  }
  return out.slice(0, opts.size);
}

export async function findSimilarCompanies(opts: {
  companyNumber: string;
  sicCode?: string | null;
  location?: string | null;
  limit?: number;
}): Promise<{
  byIndustry: DirectoryCompanyLink[];
  byLocation: DirectoryCompanyLink[];
}> {
  /** Fetch a short related list (UI shows 4, then Show more). */
  const limit = opts.limit ?? 8;
  const exclude = opts.companyNumber;

  const [industryRaw, locationRaw] = await Promise.all([
    opts.sicCode
      ? (async () => {
          const advanced = await advancedOrEmpty({
            sicCodes: [opts.sicCode!],
            companyStatus: ["active"],
            size: limit + 4,
            revalidate: 86_400,
          });
          if (advanced.length > 0) return advanced;
          return nameSearchFallback({
            sicCode: opts.sicCode!,
            size: limit + 4,
          });
        })()
      : Promise.resolve([] as ChSearchItem[]),
    opts.location
      ? (async () => {
          const advanced = await advancedOrEmpty({
            location: opts.location!,
            sicCodes: opts.sicCode ? [opts.sicCode] : undefined,
            companyStatus: ["active"],
            size: limit + 4,
            revalidate: 86_400,
          });
          if (advanced.length > 0) return advanced;
          return nameSearchFallback({
            sicCode: opts.sicCode ?? undefined,
            location: opts.location!,
            size: limit + 4,
          });
        })()
      : Promise.resolve([] as ChSearchItem[]),
  ]);

  return {
    byIndustry: toDirectoryLinks(industryRaw, exclude).slice(0, limit),
    byLocation: toDirectoryLinks(locationRaw, exclude).slice(0, limit),
  };
}

export async function listCompaniesForHub(opts: {
  sicCode?: string;
  location?: string;
  size?: number;
}): Promise<DirectoryCompanyLink[]> {
  const size = opts.size ?? 40;

  // Prefer local Basic Company Data SQLite (no CH quota) when present.
  const local = listCompaniesFromDirectoryDb({
    sicCode: opts.sicCode,
    location: opts.location,
    size,
  });
  if (local && local.length > 0) return local;

  let items = await advancedOrEmpty({
    sicCodes: opts.sicCode ? [opts.sicCode] : undefined,
    location: opts.location,
    companyStatus: ["active"],
    size,
    revalidate: 86_400,
  });

  // Advanced search often 429s; also treat empty as a soft failure and fall back.
  if (items.length === 0) {
    items = await nameSearchFallback({
      sicCode: opts.sicCode,
      location: opts.location,
      size,
    });
  }

  return toDirectoryLinks(items);
}
