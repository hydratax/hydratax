import {
  renderPayrollSummaryHtml,
  renderPayslipHtml,
} from "@/lib/payroll";
import type { PayLine } from "@/server/hmrc/payroll";
import { createPasswordProtectedZip } from "./zip-crypto";

export function buildPayrollPackZip(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: PayLine[];
  password: string;
}): Buffer {
  const summary = renderPayrollSummaryHtml(opts);
  const entries = [
    {
      name: `payroll-summary-${opts.payDate}.html`,
      data: summary,
    },
    ...opts.lines.map((line) => ({
      name: `payslips/${safeName(line.payrollId, line.surname, line.forename)}.html`,
      data: renderPayslipHtml({ ...opts, line }),
    })),
  ];
  return createPasswordProtectedZip(entries, opts.password);
}

function safeName(payrollId: string, surname: string, forename: string) {
  const raw = `${payrollId}-${surname}-${forename}`.toLowerCase();
  return raw.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}
