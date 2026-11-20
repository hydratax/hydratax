import type { PayLine } from "@/server/hmrc/payroll";
import { createPackZip } from "./zip-crypto";
import {
  payslipPdfFileName,
  renderPayslipPdfBuffer,
  summaryPdfFileName,
} from "@/server/payroll/payslip-pdf";
import { renderPayrollSummaryPdfBuffer } from "@/server/payroll/summary-pdf";
import { PDFDocument } from "pdf-lib";

export type PackBuildOpts = {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: PayLine[];
  /** Null/omit = unencrypted zip (desk still opens). */
  password?: string | null;
};

export type PackRangeItem = {
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  line: PayLine;
};

async function uniqueName(used: Set<string>, name: string) {
  let out = name;
  if (used.has(out)) {
    const base = out.replace(/\.pdf$/i, "");
    let n = 2;
    while (used.has(`${base}_${n}.pdf`)) n += 1;
    out = `${base}_${n}.pdf`;
  }
  used.add(out);
  return out;
}

/** One zip: payroll summary PDF + one PDF per employee. */
export async function buildPayrollPackZip(opts: PackBuildOpts): Promise<Buffer> {
  if (!opts.lines.length) {
    throw new Error("This run has no payslips to pack.");
  }
  const summary = await renderPayrollSummaryPdfBuffer(opts);
  const used = new Set<string>();
  const entries: Array<{ name: string; data: Buffer }> = [
    { name: summaryPdfFileName(opts.payDate), data: summary },
  ];
  for (const line of opts.lines) {
    const name = await uniqueName(
      used,
      payslipPdfFileName(line.forename, opts.payDate),
    );
    entries.push({
      name,
      data: await renderPayslipPdfBuffer({ ...opts, line }),
    });
  }
  return createPackZip(entries, opts.password);
}

/**
 * Multi-run pack: one landscape summary for the date range + every payslip PDF.
 */
export async function buildPayrollRangePackZip(opts: {
  employerName: string;
  payeRef: string;
  password?: string | null;
  fromDate: string;
  toDate: string;
  items: PackRangeItem[];
}): Promise<Buffer> {
  if (!opts.items.length) {
    throw new Error("No payslips found for that date range.");
  }
  const summary = await renderPayrollSummaryPdfBuffer({
    employerName: opts.employerName,
    payeRef: opts.payeRef,
    payDate: opts.toDate,
    periodStart: opts.fromDate,
    periodEnd: opts.toDate,
    frequency: opts.items[0]?.frequency ?? "M1",
    lines: opts.items.map((it) => ({
      ...it.line,
      payslipDate: it.payDate,
    })),
    rangeLabel: `${opts.fromDate} → ${opts.toDate}`,
  });

  const used = new Set<string>();
  const entries: Array<{ name: string; data: Buffer }> = [
    {
      name: `Payroll_Summary_${opts.fromDate}_${opts.toDate}.pdf`,
      data: summary,
    },
  ];

  for (const item of opts.items) {
    const name = await uniqueName(
      used,
      payslipPdfFileName(item.line.forename, item.payDate),
    );
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

  return createPackZip(entries, opts.password);
}

/** Multi-page PDF of every payslip in the range (for View — no zip/password). */
export async function buildPayrollRangePayslipsPdf(opts: {
  employerName: string;
  payeRef: string;
  items: PackRangeItem[];
}): Promise<Buffer> {
  if (!opts.items.length) {
    throw new Error("No payslips found for that date range.");
  }
  const merged = await PDFDocument.create();
  for (const item of opts.items) {
    const buf = await renderPayslipPdfBuffer({
      employerName: opts.employerName,
      payeRef: opts.payeRef,
      payDate: item.payDate,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      frequency: item.frequency,
      line: item.line,
    });
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  return Buffer.from(await merged.save());
}

/** Multi-month pack for one employee. */
export async function buildEmployeePayslipPackZip(opts: {
  employerName: string;
  payeRef: string;
  password?: string | null;
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
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (const item of opts.items) {
    const name = await uniqueName(
      used,
      payslipPdfFileName(item.line.forename, item.payDate),
    );
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
  return createPackZip(entries, opts.password);
}
