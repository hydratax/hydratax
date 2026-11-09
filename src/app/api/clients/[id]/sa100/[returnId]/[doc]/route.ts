import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa100Return } from "@/server/actions/sa100";
import { buildSa302Pdf } from "@/server/sa100/pdf";
import { buildSa100PackPdf } from "@/server/sa100/pack";

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
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SA302-${row.taxYear}.pdf"`,
      },
    });
  }

  if (doc === "sa100.pdf") {
    // SA100 download = main return + only the supplements required by income.
    const { bytes, supplements } = await buildSa100PackPdf(
      row.draft,
      taxpayerName,
      meta,
    );
    const suffix = supplements.length ? `+${supplements.join("+")}` : "";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SA100-${row.taxYear}${suffix}.pdf"`,
        "X-HydraTax-SA-Supplements": supplements.join(","),
      },
    });
  }

  return new Response("Unknown document", { status: 404 });
}
