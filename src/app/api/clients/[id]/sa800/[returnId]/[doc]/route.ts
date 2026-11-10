import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa800Return } from "@/server/actions/sa800";
import { buildSa800Pdf, buildSa800SummaryPdf } from "@/server/sa800/pdf";

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
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SA800-${row.taxYear}.pdf"`,
      },
    });
  }

  if (doc === "summary.pdf") {
    const bytes = await buildSa800SummaryPdf({
      draft: row.draft,
      calculation: row.calculation,
      clientName: client.name,
      status: row.status,
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sa800-${row.taxYear}-summary.pdf"`,
      },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown document" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
