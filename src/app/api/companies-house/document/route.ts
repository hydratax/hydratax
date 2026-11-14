import { NextResponse } from "next/server";
import { parseCompanyNumberStrict } from "@/lib/company-number";
import { attachmentDisposition, sanitizeFilename } from "@/lib/file-types";
import {
  downloadFilingDocument,
  getLastAccountsFiling,
  isCompaniesHouseApiConfigured,
  peekFilingDocument,
} from "@/server/companies-house/api";
import { limitCompaniesHouseRoute } from "@/server/companies-house/route-guard";

/**
 * Streams the latest accounts filing document from Companies House.
 * Public register data — available without a practice session (API key is server-side).
 * GET /api/companies-house/document?company=12345678
 * GET /api/companies-house/document?company=12345678&check=1  → JSON availability only
 *
 * The register content is third-party controlled (iXBRL/XHTML/HTML can be filed),
 * so it must never be rendered on our origin: only genuine PDFs are served inline;
 * everything else is forced to download as an opaque, sandboxed attachment.
 */

/** Header-safe single-line ASCII. */
function headerSafe(value: string | null | undefined, max = 200): string {
  return (value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function looksLikePdf(bytes: Uint8Array): boolean {
  // %PDF- within the first 1024 bytes (spec allows leading junk)
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export async function GET(req: Request) {
  const limited = limitCompaniesHouseRoute(req, "document", 20);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const company = parseCompanyNumberStrict(searchParams.get("company"));
  const checkOnly = searchParams.get("check") === "1";
  if (!company) {
    return NextResponse.json(
      { error: "Provide a valid company number (8 letters/digits)." },
      { status: 400 },
    );
  }

  if (!isCompaniesHouseApiConfigured()) {
    return NextResponse.json(
      { error: "Companies House lookup is not configured." },
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
    const bytes = new Uint8Array(doc.bytes);
    const isPdf =
      doc.contentType.toLowerCase().split(";")[0]!.trim() === "application/pdf" &&
      looksLikePdf(bytes);

    const filename = sanitizeFilename(
      doc.filename || (isPdf ? "accounts.pdf" : "accounts.bin"),
    );

    const headers: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, max-age=1800",
      "X-Accounts-Description": headerSafe(filing.description),
      "X-Accounts-Made-Up-To": headerSafe(filing.madeUpTo, 20),
      "X-Accounts-Filed-On": headerSafe(filing.filedOn, 20),
    };
    if (isPdf) {
      headers["Content-Type"] = "application/pdf";
      headers["Content-Disposition"] = `inline; filename="${filename.replace(/[^\w.\- ]/g, "_")}"`;
    } else {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Disposition"] = attachmentDisposition(filename);
      headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
    }

    return new NextResponse(bytes, { status: 200, headers });
  } catch (err) {
    console.error(
      "[ch.document] fetch failed:",
      (err instanceof Error ? err.message : "unknown").slice(0, 200),
    );
    return NextResponse.json(
      { error: "Failed to fetch accounts document from Companies House." },
      { status: 502 },
    );
  }
}
