import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getPayRun } from "@/server/actions/payroll";
import { renderPayslipHtml } from "@/lib/payroll";
import { renderPayslipPdfBuffer } from "@/server/payroll/payslip-pdf";
import type { PayLine } from "@/server/hmrc/payroll";
import type { DeskProfile } from "@/lib/desk-profile";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  await requireModule("payroll");
  const { id, runId } = await context.params;
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employee");
  const format = url.searchParams.get("format");
  const client = await getClient(id);
  const run = await getPayRun(id, runId);
  if (!run) {
    return new Response("Payslip not found", { status: 404 });
  }
  const lines = (
    Array.isArray((run as { lines?: PayLine[] }).lines)
      ? (run as { lines: PayLine[] }).lines
      : []
  ) as PayLine[];
  const line = lines.find((l) => l.employeeId === employeeId) ?? lines[0];
  if (!line) {
    return new Response("Employee not on this run", { status: 404 });
  }
  const payDate = String((run as { payDate?: string }).payDate ?? "");
  const common = {
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    payDate,
    periodStart: String((run as { periodStart?: string }).periodStart ?? ""),
    periodEnd: String((run as { periodEnd?: string }).periodEnd ?? ""),
    frequency: String((run as { payFrequency?: string }).payFrequency ?? "M1"),
    line,
  };

  if (format === "html") {
    const template =
      (client as { deskProfile?: DeskProfile }).deskProfile?.payrollSettings
        ?.payslipTemplate ?? "hydra_a";
    const html = renderPayslipHtml({ ...common, template });
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const pdf = await renderPayslipPdfBuffer(common);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${line.forename}-${payDate}-payslip.pdf"`,
    },
  });
}
