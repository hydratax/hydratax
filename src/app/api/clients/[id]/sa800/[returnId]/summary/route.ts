import { NextResponse } from "next/server";
import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa800Return } from "@/server/actions/sa800";
import { buildSa800SummaryPdf } from "@/server/sa800/pdf";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; returnId: string }> },
) {
  await requireModule("self_assessment");
  const { id: clientId, returnId } = await ctx.params;
  try {
    const client = await getClient(clientId);
    const row = await getSa800Return(clientId, returnId);
    const bytes = await buildSa800SummaryPdf({
      draft: row.draft,
      calculation: row.calculation,
      clientName: client.name,
      status: row.status,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sa800-${row.taxYear}-summary.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
