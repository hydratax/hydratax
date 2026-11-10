import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa800Return } from "@/server/actions/sa800";
import { buildSa800Pdf, buildSa800SummaryPdf } from "@/server/sa800/pdf";
import { protectClientPdf } from "@/server/pdf/lock-for-client";

async function lockedResponse(
  clientId: string,
  pdfBytes: Uint8Array,
  pdfFilename: string,
) {
  const result = await protectClientPdf({
    clientId,
    pdfBytes,
    pdfFilename,
  });
  if (result.locked) {
    return new Response(new Uint8Array(result.pack.bytes), {
      headers: {
        "Content-Type": result.pack.contentType,
        "Content-Disposition": `attachment; filename="${result.pack.filename}"`,
        "X-HydraTax-Pdf-Lock": "dob",
        "X-HydraTax-Pdf-Lock-Hint": result.pack.passwordHint,
      },
    });
  }
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
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
  const row = await getSa800Return(id, returnId);
  const meta = {
    submissionRef: null as string | null,
    status: row.status,
  };

  if (doc === "sa800.pdf") {
    const bytes = await buildSa800Pdf({
      draft: row.draft,
      calculation: row.calculation,
      clientName: client.name,
      meta,
    });
    return lockedResponse(id, bytes, `SA800-${row.taxYear}.pdf`);
  }

  if (doc === "summary.pdf") {
    const bytes = await buildSa800SummaryPdf({
      draft: row.draft,
      calculation: row.calculation,
      clientName: client.name,
      status: row.status,
    });
    return lockedResponse(id, bytes, `sa800-${row.taxYear}-summary.pdf`);
  }

  return new Response(JSON.stringify({ error: "Unknown document" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
