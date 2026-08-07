import { NextResponse } from "next/server";
import {
  isCompaniesHouseApiConfigured,
  lookupCompanyBundle,
  mockSearch,
  searchCompanies,
} from "@/server/companies-house/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const companyNumber = searchParams.get("company_number")?.trim();

  try {
    if (companyNumber) {
      if (!isCompaniesHouseApiConfigured()) {
        return NextResponse.json({
          configured: false,
          profile: {
            company_number: companyNumber,
            company_name: "Set COMPANIES_HOUSE_API_KEY for live lookup",
          },
          officers: [],
          pscs: [],
          message:
            "Add a free Companies House API key to pull live officers and PSCs.",
        });
      }
      const bundle = await lookupCompanyBundle(companyNumber);
      return NextResponse.json({ configured: true, ...bundle });
    }

    if (!q) {
      return NextResponse.json({ error: "Provide q or company_number" }, { status: 400 });
    }

    if (!isCompaniesHouseApiConfigured()) {
      return NextResponse.json({
        configured: false,
        items: mockSearch(q),
        message:
          "Live Companies House search requires COMPANIES_HOUSE_API_KEY (developer.company-information.service.gov.uk).",
      });
    }

    const items = await searchCompanies(q);
    return NextResponse.json({ configured: true, items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Companies House lookup failed" },
      { status: 502 },
    );
  }
}
