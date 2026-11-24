import { NextResponse } from "next/server";
import { parseCompanyNumberStrict } from "@/lib/company-number";
import { limitCompaniesHouseRoute } from "@/server/companies-house/route-guard";
import {
  getCompaniesHouseEnvLabel,
  isCompaniesHouseApiConfigured,
  lookupCompanyBundle,
  mockSearch,
  searchCompanies,
} from "@/server/companies-house/api";
import { searchCompaniesFromDirectoryHubs } from "@/server/companies-house/directory-db";

export async function GET(req: Request) {
  const limited = limitCompaniesHouseRoute(req, "search", 120);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const rawCompanyNumber = searchParams.get("company_number")?.trim();
  const chEnv = getCompaniesHouseEnvLabel();

  if (q.length > 120) {
    return NextResponse.json({ error: "Search text is too long." }, { status: 400 });
  }
  const companyNumber = rawCompanyNumber
    ? parseCompanyNumberStrict(rawCompanyNumber)
    : undefined;
  if (rawCompanyNumber && !companyNumber) {
    return NextResponse.json(
      { error: "Company number must be 8 letters/digits (e.g. 01234567 or SC123456)." },
      { status: 400 },
    );
  }

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

    // Prefer local hub index first — avoids burning CH quota on typeahead.
    const localHits = searchCompaniesFromDirectoryHubs(q, 20).map((r) => ({
      company_number: r.companyNumber,
      title: r.title,
      company_status: r.status,
      address_snippet: r.addressSnippet,
    }));
    if (localHits.length > 0) {
      return NextResponse.json({
        configured: isCompaniesHouseApiConfigured(),
        env: chEnv,
        items: localHits,
        source: "local",
      });
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

    try {
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
    } catch (searchErr) {
      const searchRaw =
        searchErr instanceof Error ? searchErr.message : "Companies House lookup failed";
      if (/429|Too Many Requests/i.test(searchRaw)) {
        const local = searchCompaniesFromDirectoryHubs(q, 20).map((r) => ({
          company_number: r.companyNumber,
          title: r.title,
          company_status: r.status,
          address_snippet: r.addressSnippet,
        }));
        if (local.length > 0) {
          return NextResponse.json({
            configured: true,
            env: chEnv,
            items: local,
            source: "local",
            message: undefined,
          });
        }
        return NextResponse.json(
          {
            configured: true,
            env: chEnv,
            items: [],
            message: "Companies House is busy — wait a moment and try again.",
            busy: true,
          },
          { status: 200 },
        );
      }
      throw searchErr;
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Companies House lookup failed";
    console.error("[ch.search] lookup failed:", raw.slice(0, 200));
    if (/429|Too Many Requests/i.test(raw)) {
      const q2 = new URL(req.url).searchParams.get("q")?.trim() ?? "";
      const local =
        q2.length >= 2
          ? searchCompaniesFromDirectoryHubs(q2, 20).map((r) => ({
              company_number: r.companyNumber,
              title: r.title,
              company_status: r.status,
              address_snippet: r.addressSnippet,
            }))
          : [];
      if (local.length > 0) {
        return NextResponse.json({
          configured: true,
          env: chEnv,
          items: local,
          source: "local",
        });
      }
      return NextResponse.json(
        {
          configured: true,
          env: chEnv,
          items: [],
          message: "Companies House is busy — wait a moment and try again.",
          busy: true,
        },
        { status: 200 },
      );
    }
    const needsLiveKey =
      /401/.test(raw) && chEnv === "live"
        ? " This looks like a Test API key on the live host — create a Live REST key at developer.company-information.service.gov.uk, or set COMPANIES_HOUSE_ENV=test for sandbox only."
        : /401/.test(raw) && chEnv === "test"
          ? " Auth failed on the Companies House sandbox — use a Test API key, or set COMPANIES_HOUSE_ENV=live with a Live REST key."
          : "";
    return NextResponse.json(
      { error: `Companies House lookup failed.${needsLiveKey}`, env: chEnv },
      { status: 502 },
    );
  }
}
