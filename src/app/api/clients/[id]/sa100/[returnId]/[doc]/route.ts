import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa100Return } from "@/server/actions/sa100";
import { buildSa302Pdf } from "@/server/sa100/pdf";
import { buildSa100PackPdf } from "@/server/sa100/pack";
import { protectClientPdf } from "@/server/pdf/lock-for-client";

async function lockedResponse(
  clientId: string,
  pdfBytes: Uint8Array,
  pdfFilename: string,
  dateOfBirth?: string | null,
  extraHeaders?: Record<string, string>,
) {
  const result = await protectClientPdf({
    clientId,
    pdfBytes,
    pdfFilename,
    dateOfBirth,
  });
  if (result.locked) {
    return new Response(new Uint8Array(result.pack.bytes), {
      headers: {
        "Content-Type": result.pack.contentType,
        "Content-Disposition": `attachment; filename="${result.pack.filename}"`,
        "X-HydraTax-Pdf-Lock": "dob",
        "X-HydraTax-Pdf-Lock-Hint": result.pack.passwordHint,
        ...extraHeaders,
      },
    });
  }
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      ...extraHeaders,
    },
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; returnId: string; doc: string }>;
  },
) {
  await requireModule("self_assessment");
  const { id, returnId, doc } = await context.params;
  const client = await getClient(id);
  const row = await getSa100Return(id, returnId);

  // Prefer the person named on the return — never fall back to a limited
  // company client name (that was appearing as a fake employer reference).
  const taxpayerName =
    row.draft.declarationName?.trim() ||
    (client.type === "limited_company" ? "" : client.name);
  const meta = {
    submissionRef: row.hmrcCorrelationId ?? null,
    status: row.status,
    taxYear: row.taxYear,
  };

  if (doc === "sa302.pdf") {
    const bytes = await buildSa302Pdf(
      row.calculation,
      taxpayerName,
      row.draft.utr || client.utr || "",
      meta,
    );
    return lockedResponse(
      id,
      bytes,
      `SA302-${row.taxYear}.pdf`,
      row.draft.dateOfBirth,
    );
  }

  if (doc === "sa100.pdf") {
    // SA100 download = main return + only the supplements required by income.
    const { bytes, supplements } = await buildSa100PackPdf(
      row.draft,
      taxpayerName,
      meta,
    );
    const suffix = supplements.length ? `+${supplements.join("+")}` : "";
    return lockedResponse(
      id,
      bytes,
      `SA100-${row.taxYear}${suffix}.pdf`,
      row.draft.dateOfBirth,
      { "X-HydraTax-SA-Supplements": supplements.join(",") },
    );
  }

  return new Response("Unknown document", { status: 404 });
}
