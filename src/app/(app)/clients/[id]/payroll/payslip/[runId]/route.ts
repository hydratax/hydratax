import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getPayRun } from "@/server/actions/payroll";
import { renderPayslipHtml } from "@/lib/payroll";
import type { PayLine } from "@/server/hmrc/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  await requireModule("payroll");
  const { id, runId } = await context.params;
  const employeeId = new URL(request.url).searchParams.get("employee");
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
  const html = renderPayslipHtml({
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    payDate: String((run as { payDate?: string }).payDate ?? ""),
    periodStart: String((run as { periodStart?: string }).periodStart ?? ""),
    periodEnd: String((run as { periodEnd?: string }).periodEnd ?? ""),
    frequency: String((run as { payFrequency?: string }).payFrequency ?? "M1"),
    line,
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
