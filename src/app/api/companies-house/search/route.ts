import { NextResponse } from "next/server";
import {
  getCompaniesHouseEnvLabel,
  isCompaniesHouseApiConfigured,
  lookupCompanyBundle,
  mockSearch,
  searchCompanies,
} from "@/server/companies-house/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const companyNumber = searchParams.get("company_number")?.trim();
  const chEnv = getCompaniesHouseEnvLabel();

  try {
    if (companyNumber) {
      if (!isCompaniesHouseApiConfigured()) {
        return NextResponse.json({
          configured: false,
          env: chEnv,
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
      return NextResponse.json({ configured: true, env: chEnv, ...bundle });
    }

    if (!q) {
      return NextResponse.json({ error: "Provide q or company_number" }, { status: 400 });
    }

    if (!isCompaniesHouseApiConfigured()) {
      return NextResponse.json({
        configured: false,
        env: chEnv,
        items: mockSearch(q),
        message:
          "Live Companies House search requires COMPANIES_HOUSE_API_KEY (developer.company-information.service.gov.uk).",
      });
    }

    const items = await searchCompanies(q);
    if (items.length === 0 && chEnv === "test") {
      return NextResponse.json({
        configured: true,
        env: chEnv,
        items: [],
        message:
          "Companies House test environment has no searchable register data. Create a free Live REST API key at developer.company-information.service.gov.uk, then set COMPANIES_HOUSE_ENV=live in .env.local and restart.",
      });
    }
    return NextResponse.json({
      configured: true,
      env: chEnv,
      items,
      message: items.length === 0 ? "No companies matched that search." : undefined,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Companies House lookup failed";
    const needsLiveKey =
      /401/.test(raw) && chEnv === "live"
        ? " This looks like a Test API key on the live host — create a Live REST key, or set COMPANIES_HOUSE_ENV=test."
        : /401/.test(raw) && chEnv === "test"
          ? " Auth failed — check COMPANIES_HOUSE_API_KEY."
          : "";
    return NextResponse.json(
      { error: `${raw}${needsLiveKey}`, env: chEnv },
      { status: 502 },
    );
  }
}
