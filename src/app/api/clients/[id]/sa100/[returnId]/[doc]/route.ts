import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa100Return } from "@/server/actions/sa100";
import { buildSa100Pdf, buildSa302Pdf } from "@/server/sa100/pdf";

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

  if (doc === "sa302.pdf") {
    const bytes = await buildSa302Pdf(
      row.calculation,
      client.name,
      row.draft.utr || client.utr || "",
    );
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SA302-${row.taxYear}.pdf"`,
      },
    });
  }

  if (doc === "sa100.pdf") {
    const bytes = await buildSa100Pdf(row.draft, client.name);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SA100-${row.taxYear}.pdf"`,
      },
    });
  }

  return new Response("Unknown document", { status: 404 });
}
