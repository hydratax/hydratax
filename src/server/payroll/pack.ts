import type { PayLine } from "@/server/hmrc/payroll";
import { createPasswordProtectedZip } from "./zip-crypto";
import {
  payslipPdfFileName,
  renderPayslipPdfBuffer,
  summaryPdfFileName,
} from "@/server/payroll/payslip-pdf";
import { renderPayrollSummaryPdfBuffer } from "@/server/payroll/summary-pdf";

export type PackBuildOpts = {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: PayLine[];
  password: string;
};

/** One zip: payroll summary PDF + one PDF per employee named FirstName_Month_Year.pdf */
export async function buildPayrollPackZip(opts: PackBuildOpts): Promise<Buffer> {
  if (!opts.lines.length) {
    throw new Error("This run has no payslips to pack.");
  }
  const summary = await renderPayrollSummaryPdfBuffer(opts);
  const payslips = await Promise.all(
    opts.lines.map(async (line) => ({
      name: payslipPdfFileName(line.forename, opts.payDate),
      data: await renderPayslipPdfBuffer({ ...opts, line }),
    })),
  );
  // De-dupe names if two people share a forename
  const used = new Set<string>();
  const entries = [
    {
      name: summaryPdfFileName(opts.payDate),
      data: summary,
    },
    ...payslips.map((p) => {
      let name = p.name;
      if (used.has(name)) {
        const base = name.replace(/\.pdf$/i, "");
        let n = 2;
        while (used.has(`${base}_${n}.pdf`)) n += 1;
        name = `${base}_${n}.pdf`;
      }
      used.add(name);
      return { name, data: p.data };
    }),
  ];
  return createPasswordProtectedZip(entries, opts.password);
}

/** Multi-month pack for one employee (or filtered set of lines with dates). */
export async function buildEmployeePayslipPackZip(opts: {
  employerName: string;
  payeRef: string;
  password: string;
  items: Array<{
    payDate: string;
    periodStart: string;
    periodEnd: string;
    frequency: string;
    line: PayLine;
  }>;
}): Promise<Buffer> {
  if (!opts.items.length) {
    throw new Error("No payslips found for that employee and period.");
  }
  const used = new Set<string>();
  const entries = [];
  for (const item of opts.items) {
    let name = payslipPdfFileName(item.line.forename, item.payDate);
    if (used.has(name)) {
      const base = name.replace(/\.pdf$/i, "");
      let n = 2;
      while (used.has(`${base}_${n}.pdf`)) n += 1;
      name = `${base}_${n}.pdf`;
    }
    used.add(name);
    entries.push({
      name,
      data: await renderPayslipPdfBuffer({
        employerName: opts.employerName,
        payeRef: opts.payeRef,
        payDate: item.payDate,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        frequency: item.frequency,
        line: item.line,
      }),
    });
  }
  return createPasswordProtectedZip(entries, opts.password);
}
