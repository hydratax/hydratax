import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listEmployees } from "@/server/actions/payroll";
import { getPayrollDeskSettings } from "@/server/actions/payroll-settings";
import { getPracticeLetterhead } from "@/server/actions/letterhead";
import { money } from "@/lib/format";
import { taxYearFromDate } from "@/lib/payroll";

function taxYearLabelFromShort(short: string): string {
  const [a, b] = short.split("-");
  if (!a || !b) return "2025-26";
  const start = Number(a) > 50 ? `19${a}` : `20${a}`;
  const end = Number(b) > 50 ? `19${b}` : `20${b}`;
  return `${start}-${end.slice(2)}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
) {
  await requireModule("payroll");
  const { id, employeeId } = await context.params;
  const client = await getClient(id);
  const employees = await listEmployees(id, { includeLeavers: true });
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return new Response("Employee not found", { status: 404 });
  }

  const settings = await getPayrollDeskSettings(id);
  const urlYear = new URL(request.url).searchParams.get("taxYear");
  const taxYear =
    urlYear?.trim() ||
    settings.activeTaxYear ||
    taxYearLabelFromShort(taxYearFromDate(new Date().toISOString().slice(0, 10)));

  const benefit = (settings.benefits ?? []).find(
    (b) => b.employeeId === employeeId && b.taxYear === taxYear,
  );

  const car = benefit?.companyCarPence ?? 0;
  const medical = benefit?.privateMedicalPence ?? 0;
  const other = benefit?.otherBenefitsPence ?? 0;
  const expenses = benefit?.expensesPence ?? 0;
  const total = car + medical + other + expenses;

  const letterhead = await getPracticeLetterhead();

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <title>P11D working sheet · ${employee.forename} ${employee.surname}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 2rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; max-width: 36rem; }
    th, td { text-align: left; padding: 0.5rem 0; border-bottom: 1px solid #ddd; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total td { font-weight: 700; border-bottom: none; padding-top: 0.75rem; }
    .note { margin-top: 1.5rem; font-size: 0.85rem; color: #555; max-width: 36rem; }
    @media print { body { margin: 0.75in; } }
  </style>
</head>
<body>
  <h1>Expenses and benefits (P11D working sheet)</h1>
  <p class="meta">
    ${letterhead?.practiceName ? `${letterhead.practiceName} · ` : ""}${client.name}<br />
    ${employee.forename} ${employee.surname} · ${employee.payrollId}<br />
    Tax year ${taxYear} · PAYE ${client.payeRef ?? "—"}
  </p>
  <table>
    <tr><th>Benefit</th><th class="num">Amount</th></tr>
    <tr><td>Company car / van</td><td class="num">${money(car)}</td></tr>
    <tr><td>Private medical / dental</td><td class="num">${money(medical)}</td></tr>
    <tr><td>Other benefits</td><td class="num">${money(other)}</td></tr>
    <tr><td>Expenses payments</td><td class="num">${money(expenses)}</td></tr>
    <tr class="total"><td>Total for SA / EXB</td><td class="num">${money(total)}</td></tr>
  </table>
  ${
    benefit?.notes
      ? `<p class="note">Notes: ${benefit.notes.replace(/</g, "&lt;")}</p>`
      : ""
  }
  <p class="note">
    Working sheet for the practice desk — enter figures from employer records,
    then transfer to the employee’s Self Assessment or year-end EXB filing as required.
  </p>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
