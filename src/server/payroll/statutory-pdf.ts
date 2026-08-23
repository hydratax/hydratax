import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { YtdTotals } from "@/server/hmrc/payroll";
import type { PayLine } from "@/server/hmrc/payroll";
import type { StatutoryEmployee, StatutoryEmployer } from "@/server/payroll/statutory-forms";

/**
 * HMRC does not publish blank fillable P45/P60 for employers to download.
 * Software must issue substitute forms that match HMRC design specs:
 * - P45(Online): https://www.gov.uk/government/publications/paye-draft-forms-p45
 * - P60 RD1 / draft forms: https://www.gov.uk/government/publications/paye-draft-forms-p60
 *
 * These PDFs are HydraTax substitute forms filled with payroll data.
 */

const ink = rgb(0.07, 0.09, 0.11);
const muted = rgb(0.35, 0.38, 0.42);
const rule = rgb(0.72, 0.74, 0.76);
const band = rgb(0.93, 0.94, 0.95);

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((pence || 0) / 100);
}

function money(pence: number | undefined | null) {
  return gbp(pence ?? 0);
}

type DrawCtx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
};

function drawHeader(ctx: DrawCtx, title: string, subtitle: string, y: number) {
  const { page, font, bold, width } = ctx;
  page.drawRectangle({
    x: 40,
    y: y - 8,
    width: width - 80,
    height: 52,
    color: band,
  });
  page.drawText(title, { x: 52, y: y + 22, size: 16, font: bold, color: ink });
  page.drawText(subtitle, { x: 52, y: y + 6, size: 9, font, color: muted });
  return y - 28;
}

function drawLabelValue(
  ctx: DrawCtx,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW = 170,
  valueW = 300,
) {
  const { page, font, bold } = ctx;
  page.drawText(label, { x, y, size: 9, font: bold, color: muted });
  const lines = wrapText(value || "—", font, 10, valueW);
  let yy = y;
  for (const line of lines) {
    page.drawText(line, { x: x + labelW, y: yy, size: 10, font, color: ink });
    yy -= 12;
  }
  return Math.min(y - 16, yy - 4);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}

function section(ctx: DrawCtx, title: string, y: number) {
  const { page, bold, width } = ctx;
  page.drawText(title, { x: 48, y, size: 11, font: bold, color: ink });
  page.drawLine({
    start: { x: 48, y: y - 4 },
    end: { x: width - 48, y: y - 4 },
    thickness: 0.6,
    color: rule,
  });
  return y - 20;
}

function footer(ctx: DrawCtx, text: string) {
  const { page, font, width } = ctx;
  page.drawText(text, {
    x: 48,
    y: 36,
    size: 7.5,
    font,
    color: muted,
    maxWidth: width - 96,
  });
}

export async function renderP45Pdf(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  leaveDate: string;
  totals: YtdTotals;
  issuedAt?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const issued = opts.issuedAt ?? new Date().toISOString().slice(0, 10);
  const pay = money(opts.totals.taxablePence ?? opts.totals.grossPence);
  const tax = money(opts.totals.taxPence);
  const ni = money(opts.totals.employeeNiPence);

  const parts: Array<{ code: string; title: string; audience: string }> = [
    {
      code: "Part 1A",
      title: "P45 — Details of employee leaving work",
      audience: "Employee copy (keep safe)",
    },
    {
      code: "Part 2",
      title: "P45 — Details of employee leaving work",
      audience: "Copy for new employer",
    },
    {
      code: "Part 3",
      title: "P45 — New employee details",
      audience: "For completion by new employer (leaving figures pre-filled)",
    },
  ];

  for (const part of parts) {
    const page = doc.addPage([595.28, 841.89]);
    const ctx: DrawCtx = {
      page,
      font,
      bold,
      width: page.getWidth(),
      height: page.getHeight(),
    };
    let y = drawHeader(
      ctx,
      part.title,
      `${part.code} · ${part.audience} · Tax year ${opts.taxYear} · Issued ${issued} · HydraTax (Substitute)`,
      page.getHeight() - 56,
    );

    y = section(ctx, "Employer", y);
    y = drawLabelValue(ctx, "Employer name", opts.employer.name, 48, y);
    y = drawLabelValue(ctx, "PAYE reference", opts.employer.payeRef || "—", 48, y);
    y = drawLabelValue(
      ctx,
      "Accounts office reference",
      opts.employer.accountsOfficeRef || "—",
      48,
      y,
    );

    y = section(ctx, "Employee", y - 8);
    y = drawLabelValue(
      ctx,
      "Name",
      `${opts.employee.forename} ${opts.employee.surname}`,
      48,
      y,
    );
    y = drawLabelValue(ctx, "National Insurance number", opts.employee.nino, 48, y);
    y = drawLabelValue(ctx, "Works / payroll number", opts.employee.payrollId, 48, y);
    y = drawLabelValue(ctx, "Tax code at leaving", opts.employee.taxCode, 48, y);
    y = drawLabelValue(ctx, "NI category", opts.employee.niCategory || "A", 48, y);
    y = drawLabelValue(ctx, "Date employment started", opts.employee.startDate, 48, y);
    y = drawLabelValue(ctx, "Date employment ended", opts.leaveDate, 48, y);

    y = section(ctx, "Pay and tax to date (this employment)", y - 8);
    y = drawLabelValue(ctx, "Total pay to date", pay, 48, y);
    y = drawLabelValue(ctx, "Total tax to date", tax, 48, y);
    y = drawLabelValue(ctx, "Employee NI to date", ni, 48, y);

    footer(
      ctx,
      "HMRC substitute P45(Online). Leaving is also reported on FPS. Verify figures before issue. HydraTax (Substitute).",
    );
  }

  return doc.save();
}

export async function renderP60Pdf(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  totals: YtdTotals;
  previousEmployment?: YtdTotals | null;
  issuedAt?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const ctx: DrawCtx = {
    page,
    font,
    bold,
    width: page.getWidth(),
    height: page.getHeight(),
  };
  const issued = opts.issuedAt ?? new Date().toISOString().slice(0, 10);

  let y = drawHeader(
    ctx,
    "P60 — End of Year Certificate",
    `Tax year ${opts.taxYear} ending 5 April · Issued ${issued} · This is a printed copy of an eP60 · HydraTax (Substitute)`,
    page.getHeight() - 56,
  );

  y = section(ctx, "Employer", y);
  y = drawLabelValue(ctx, "Employer name", opts.employer.name, 48, y);
  y = drawLabelValue(ctx, "PAYE reference", opts.employer.payeRef || "—", 48, y);
  y = drawLabelValue(
    ctx,
    "Accounts office reference",
    opts.employer.accountsOfficeRef || "—",
    48,
    y,
  );

  y = section(ctx, "Employee", y - 8);
  y = drawLabelValue(
    ctx,
    "Name",
    `${opts.employee.forename} ${opts.employee.surname}`,
    48,
    y,
  );
  y = drawLabelValue(ctx, "National Insurance number", opts.employee.nino, 48, y);
  y = drawLabelValue(ctx, "Works / payroll number", opts.employee.payrollId, 48, y);
  y = drawLabelValue(ctx, "Final tax code", opts.employee.taxCode, 48, y);
  y = drawLabelValue(ctx, "NI category", opts.employee.niCategory || "A", 48, y);

  y = section(ctx, "Pay and deductions in this employment", y - 8);
  y = drawLabelValue(
    ctx,
    "Total pay in this employment",
    money(opts.totals.taxablePence ?? opts.totals.grossPence),
    48,
    y,
  );
  y = drawLabelValue(ctx, "Total tax deducted", money(opts.totals.taxPence), 48, y);
  y = drawLabelValue(
    ctx,
    "Employee National Insurance",
    money(opts.totals.employeeNiPence),
    48,
    y,
  );

  const prev = opts.previousEmployment;
  if (
    prev &&
    ((prev.taxablePence ?? prev.grossPence) > 0 || prev.taxPence > 0)
  ) {
    y = section(ctx, "Previous employment(s) this tax year", y - 8);
    y = drawLabelValue(
      ctx,
      "Total pay (previous)",
      money(prev.taxablePence ?? prev.grossPence),
      48,
      y,
    );
    y = drawLabelValue(ctx, "Total tax deducted (previous)", money(prev.taxPence), 48, y);
    y = drawLabelValue(
      ctx,
      "Employee NI (previous)",
      money(prev.employeeNiPence),
      48,
      y,
    );
  }

  footer(
    ctx,
    "Employer substitute P60 per HMRC RD1. Give to employees still on payroll on 5 April, by 31 May. HydraTax (Substitute).",
  );

  return doc.save();
}

export async function renderPayslipPdf(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  line: PayLine;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const ctx: DrawCtx = {
    page,
    font,
    bold,
    width: page.getWidth(),
    height: page.getHeight(),
  };
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const line = opts.line;

  let y = drawHeader(
    ctx,
    "Payslip",
    `${freq} · ${opts.employerName} · Pay date ${opts.payDate}`,
    page.getHeight() - 56,
  );

  y = drawLabelValue(ctx, "PAYE reference", opts.payeRef || "—", 48, y);
  y = drawLabelValue(
    ctx,
    "Pay period",
    `${opts.periodStart} to ${opts.periodEnd}`,
    48,
    y,
  );
  y = drawLabelValue(
    ctx,
    "Employee",
    `${line.forename} ${line.surname}`,
    48,
    y,
  );
  y = drawLabelValue(ctx, "Payroll ID", line.payrollId, 48, y);
  y = drawLabelValue(ctx, "National Insurance number", line.nino, 48, y);
  y = drawLabelValue(ctx, "Tax code", line.taxCode, 48, y);

  y = section(ctx, "Earnings and deductions", y - 8);

  const rows: Array<[string, number, number | null]> = [
    ["Gross pay", line.grossPence, line.ytdGrossPence],
    ["PAYE tax", line.taxPence, line.ytdTaxPence],
    ["Employee NI", line.employeeNiPence, line.ytdEmployeeNiPence],
  ];
  if (line.ordinaryPence > 0 && line.ordinaryPence !== line.grossPence) {
    rows.unshift(["Ordinary pay", line.ordinaryPence, null]);
  }
  if (line.overtimePence > 0) rows.splice(1, 0, ["Overtime", line.overtimePence, null]);
  if (line.holidayPence > 0) rows.splice(1, 0, ["Holiday pay", line.holidayPence, null]);
  if (line.sspPence > 0) rows.splice(1, 0, ["Statutory sick pay", line.sspPence, null]);
  if (line.smpPence > 0) rows.splice(1, 0, ["Statutory maternity pay", line.smpPence, null]);
  if (line.pensionEmployeePence > 0) {
    rows.push(["Workplace pension (employee)", line.pensionEmployeePence, null]);
  }

  page.drawText("Item", { x: 48, y, size: 9, font: bold, color: muted });
  page.drawText("This period", { x: 300, y, size: 9, font: bold, color: muted });
  page.drawText("Year to date", { x: 420, y, size: 9, font: bold, color: muted });
  y -= 14;

  for (const [label, period, ytd] of rows) {
    page.drawText(label, { x: 48, y, size: 10, font, color: ink });
    page.drawText(money(period), { x: 300, y, size: 10, font, color: ink });
    page.drawText(ytd == null ? "—" : money(ytd), {
      x: 420,
      y,
      size: 10,
      font,
      color: ink,
    });
    y -= 16;
  }

  y -= 8;
  page.drawText(`Net pay ${money(line.netPence)}`, {
    x: 48,
    y,
    size: 14,
    font: bold,
    color: ink,
  });

  footer(
    ctx,
    "HydraTax payslip PDF. Confirm unusual cases against HMRC calculators before paying.",
  );

  return doc.save();
}
