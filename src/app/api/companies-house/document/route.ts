import { NextResponse } from "next/server";
import {
  downloadFilingDocument,
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
  peekFilingDocument,
} from "@/server/companies-house/api";

/**
 * Streams the latest accounts filing document from Companies House.
 * Public register data — available without a practice session (API key is server-side).
 * GET /api/companies-house/document?company=12345678
 * GET /api/companies-house/document?company=12345678&check=1  → JSON availability only
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get("company")?.trim().toUpperCase();
  const checkOnly = searchParams.get("check") === "1";
  if (!company) {
    return NextResponse.json(
      { error: "Provide company (company number)" },
      { status: 400 },
    );
  }

  if (!isCompaniesHouseApiConfigured()) {
    return NextResponse.json(
      {
        error:
          "COMPANIES_HOUSE_API_KEY is not set. Add a Live REST key to fetch filed accounts.",
      },
      { status: 503 },
    );
  }

  try {
    const filing = await getLastAccountsFiling(company);
    if (!filing?.documentMetadataUrl) {
      return NextResponse.json(
        {
          error:
            "No accounts document found on the Companies House register for this company.",
        },
        { status: 404 },
      );
    }

    if (checkOnly) {
      const peek = await peekFilingDocument(filing.documentMetadataUrl);
      return NextResponse.json({
        ok: true,
        description: filing.description,
        madeUpTo: filing.madeUpTo,
        filedOn: filing.filedOn,
        pages: peek.pages ?? filing.pages,
        contentType: peek.contentType,
        hasDocument: true,
      });
    }

    const doc = await downloadFilingDocument(filing.documentMetadataUrl);
    return new NextResponse(doc.bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=1800",
        "X-Accounts-Description": filing.description,
        "X-Accounts-Made-Up-To": filing.madeUpTo ?? "",
        "X-Accounts-Filed-On": filing.filedOn ?? "",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch accounts document";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
