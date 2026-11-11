import {
  advancedSearchCompanies,
  type ChSearchItem,
} from "@/server/companies-house/api";
import { toDirectoryLinks, type DirectoryCompanyLink } from "@/lib/company-directory";

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
      ? advancedSearchCompanies({
          sicCodes: [opts.sicCode],
          companyStatus: ["active"],
          size: limit + 4,
          revalidate: 86_400,
        }).catch(() => [] as ChSearchItem[])
      : Promise.resolve([] as ChSearchItem[]),
    opts.location
      ? advancedSearchCompanies({
          location: opts.location,
          sicCodes: opts.sicCode ? [opts.sicCode] : undefined,
          companyStatus: ["active"],
          size: limit + 4,
          revalidate: 86_400,
        }).catch(() => [] as ChSearchItem[])
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
  const items = await advancedSearchCompanies({
    sicCodes: opts.sicCode ? [opts.sicCode] : undefined,
    location: opts.location,
    companyStatus: ["active"],
    size: opts.size ?? 40,
    revalidate: 86_400,
  }).catch(() => [] as ChSearchItem[]);
  return toDirectoryLinks(items);
}
