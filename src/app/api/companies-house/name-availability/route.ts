import { NextResponse } from "next/server";
import {
  displayProposedName,
  evaluateNameAvailability,
} from "@/lib/ch-name-availability";
import {
  getCompaniesHouseEnvLabel,
  isCompaniesHouseApiConfigured,
  mockSearch,
  searchCompanies,
} from "@/server/companies-house/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawName = searchParams.get("name")?.trim() ?? "";
  const excludeCompanyNumber =
    searchParams.get("exclude_company_number")?.trim() ?? "";
  const chEnv = getCompaniesHouseEnvLabel();

  if (rawName.length < 3) {
    return NextResponse.json(
      { error: "Enter at least 3 characters to check a name." },
      { status: 400 },
    );
  }

  try {
    if (!isCompaniesHouseApiConfigured()) {
      const items = mockSearch(rawName);
      const result = evaluateNameAvailability(rawName, items, {
        excludeCompanyNumber,
      });
      return NextResponse.json({
        configured: false,
        env: chEnv,
        proposedName: displayProposedName(rawName),
        ...result,
        message: `${result.message} (Sample data — set COMPANIES_HOUSE_API_KEY for live register checks.)`,
      });
    }

    const items = await searchCompanies(rawName, 20);
    const result = evaluateNameAvailability(rawName, items, {
      excludeCompanyNumber,
    });

    return NextResponse.json({
      configured: true,
      env: chEnv,
      proposedName: result.checkedAs,
      ...result,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Name check failed";
    return NextResponse.json({ error: raw, env: chEnv }, { status: 502 });
  }
}
