import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getPayRun } from "@/server/actions/payroll";
import { renderPayrollSummaryHtml } from "@/lib/payroll";
import { renderPayrollSummaryPdfBuffer } from "@/server/payroll/summary-pdf";
import type { PayLine } from "@/server/hmrc/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  await requireModule("payroll");
  const { id, runId } = await context.params;
  const format = new URL(request.url).searchParams.get("format");
  const client = await getClient(id);
  const run = await getPayRun(id, runId);
  if (!run) {
    return new Response("Payroll summary not found", { status: 404 });
  }
  const lines = (
    Array.isArray((run as { lines?: PayLine[] }).lines)
      ? (run as { lines: PayLine[] }).lines
      : []
  ) as PayLine[];
  if (!lines.length) {
    return new Response("No payslips on this run", { status: 404 });
  }
  const common = {
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    payDate: String((run as { payDate?: string }).payDate ?? ""),
    periodStart: String((run as { periodStart?: string }).periodStart ?? ""),
    periodEnd: String((run as { periodEnd?: string }).periodEnd ?? ""),
    frequency: String((run as { payFrequency?: string }).payFrequency ?? "M1"),
    lines,
  };
  if (format === "html") {
    return new Response(renderPayrollSummaryHtml(common), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const pdf = await renderPayrollSummaryPdfBuffer(common);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payroll-summary-${common.payDate}.pdf"`,
    },
  });
}
