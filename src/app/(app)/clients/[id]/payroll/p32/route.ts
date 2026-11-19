import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listPayRuns } from "@/server/actions/payroll";
import { taxYearFromDate } from "@/lib/payroll";
import { renderP32Html, type P32PeriodTotals } from "@/server/payroll/p32";
import type { PayLine } from "@/server/hmrc/payroll";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireModule("payroll");
  const { id } = await context.params;
  const url = new URL(request.url);
  const taxYearParam = url.searchParams.get("taxYear")?.trim() || "";
  const client = await getClient(id);
  const runs = await listPayRuns(id);

  const periods: P32PeriodTotals[] = [];
  for (const run of runs) {
    const kind = String((run as { kind?: string }).kind ?? "FPS");
    const payDate = String((run as { payDate?: string }).payDate ?? "");
    if (!payDate) continue;
    const ty = taxYearFromDate(payDate); // e.g. 26-27
    if (taxYearParam) {
      const normalised =
        /^\d{4}-\d{2}$/.test(taxYearParam)
          ? `${taxYearParam.slice(2, 4)}-${taxYearParam.slice(5, 7)}`
          : taxYearParam;
      if (ty !== normalised && ty !== taxYearParam) continue;
    }
    if (kind === "EPS") {
      const totals = (run as { totals?: Record<string, number> }).totals ?? {};
      periods.push({
        periodLabel: `EPS ${String((run as { periodStart?: string }).periodStart ?? "")}`,
        payDate,
        taxPence: 0,
        employeeNiPence: 0,
        employerNiPence: 0,
        studentLoanPence: 0,
        postgraduateLoanPence: 0,
        smpRecoveredPence: Number(totals.smpRecoveredPence ?? 0),
      });
      continue;
    }
    const lines = Array.isArray((run as { lines?: PayLine[] }).lines)
      ? ((run as { lines: PayLine[] }).lines)
      : [];
    if (!lines.length) continue;
    periods.push({
      periodLabel:
        String((run as { payFrequency?: string }).payFrequency ?? "M1") === "W1"
          ? `Week ${payDate}`
          : `Month ${payDate.slice(0, 7)}`,
      payDate,
      taxPence: lines.reduce((s, l) => s + (l.taxPence ?? 0), 0),
      employeeNiPence: lines.reduce((s, l) => s + (l.employeeNiPence ?? 0), 0),
      employerNiPence: lines.reduce((s, l) => s + (l.employerNiPence ?? 0), 0),
      studentLoanPence: lines.reduce((s, l) => s + (l.studentLoanPence ?? 0), 0),
      postgraduateLoanPence: lines.reduce(
        (s, l) => s + (l.postgraduateLoanPence ?? 0),
        0,
      ),
    });
  }

  periods.sort((a, b) => a.payDate.localeCompare(b.payDate));
  const taxYear =
    taxYearParam ||
    (periods[0] ? taxYearFromDate(periods[0].payDate) : "26-27");

  const html = renderP32Html({
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    taxYear,
    periods,
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
