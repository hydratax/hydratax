import { NextResponse } from "next/server";
import { parseCompanyNumberStrict } from "@/lib/company-number";
import { limitCompaniesHouseRoute } from "@/server/companies-house/route-guard";
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
  const limited = limitCompaniesHouseRoute(req, "name", 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const rawName = searchParams.get("name")?.trim() ?? "";
  const excludeCompanyNumber =
    parseCompanyNumberStrict(searchParams.get("exclude_company_number")) ?? "";
  const chEnv = getCompaniesHouseEnvLabel();

  if (rawName.length > 160) {
    return NextResponse.json({ error: "Company name is too long." }, { status: 400 });
  }
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
    console.error(
      "[ch.name-availability] check failed:",
      (err instanceof Error ? err.message : "unknown").slice(0, 200),
    );
    return NextResponse.json(
      { error: "Name check failed. Please try again.", env: chEnv },
      { status: 502 },
    );
  }
}
