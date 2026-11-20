import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PayLine } from "@/server/hmrc/payroll";

const ink = rgb(0.06, 0.09, 0.14);
const muted = rgb(0.35, 0.4, 0.48);
const line = rgb(0.75, 0.78, 0.82);

function gbp(pence: number) {
  return `£${((pence || 0) / 100).toFixed(2)}`;
}

function ukDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function safe(s: string) {
  return String(s || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x00-\x7E£]/g, "?");
}

function draw(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = ink,
) {
  page.drawText(safe(text).slice(0, 120), { x, y, size, font, color });
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  y: number,
  size: number,
  color = ink,
) {
  const t = safe(text);
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: rightX - w, y, size, font, color });
}

/** Draw label (left) + value (right-aligned) without overlap. */
function drawFieldRow(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  label: string,
  value: string,
  x: number,
  rightX: number,
  y: number,
  size = 8,
) {
  const val = safe(value);
  const valW = bold.widthOfTextAtSize(val, size);
  const maxLabelW = Math.max(40, rightX - x - valW - 8);
  let labelText = safe(label);
  while (
    labelText.length > 12 &&
    font.widthOfTextAtSize(labelText, size) > maxLabelW
  ) {
    labelText = labelText.slice(0, -1);
  }
  if (labelText !== safe(label) && labelText.length > 0) {
    labelText = `${labelText.trimEnd()}…`;
  }
  draw(page, font, labelText, x, y, size, muted);
  drawRight(page, bold, val, rightX, y, size);
}

export type FpsReportEmployee = {
  title?: string | null;
  forename: string;
  surname: string;
  nino: string;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  payrollId: string;
  taxCode: string;
  payFrequency: string;
  hoursWorkedCode?: string;
  line: PayLine;
};

/** Soft-style per-employee FPS detail listing (period pack). */
export async function buildFpsSubmissionReportPdf(opts: {
  employerName: string;
  payeRef: string;
  taxYear: string;
  payDate: string;
  monthNo: number;
  employees: FpsReportEmployee[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 842];
  let page = doc.addPage(pageSize);
  let y = 800;
  const margin = 40;
  const mid = 297.64;
  const leftRight = mid - 12;
  const rightRight = 555;

  const header = () => {
    draw(page, bold, "Full Payment Submission (FPS) Report", margin, y, 13);
    y -= 16;
    draw(page, bold, opts.employerName, margin, y, 10);
    y -= 13;
    draw(page, bold, `PAYE Reference ${opts.payeRef}`, margin, y, 9);
    y -= 12;
    draw(page, bold, `Tax Year ${opts.taxYear}`, margin, y, 9);
    y -= 18;
  };
  header();

  for (const emp of opts.employees) {
    if (y < 180) {
      page = doc.addPage(pageSize);
      y = 800;
      header();
    }
    const name = [emp.title, emp.forename, emp.surname]
      .filter(Boolean)
      .join(" ");
    const addr = (emp.address || "")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    const left: Array<[string, string]> = [
      ["Name", name],
      ["National Insurance Number", emp.nino],
      ...addr.map((a, i) =>
        i === addr.length - 1 && /^[A-Z]{1,2}\d/i.test(a)
          ? (["Post Code", a] as [string, string])
          : (["Address Line", a] as [string, string]),
      ),
      [
        "Date of birth",
        emp.dateOfBirth
          ? ukDate(emp.dateOfBirth).replace(/\//g, "-")
          : "—",
      ],
      ["Gender", emp.gender === "F" ? "Female" : emp.gender === "M" ? "Male" : "—"],
      ["Payroll ID", emp.payrollId],
      [
        "Taxable Pay",
        ((emp.line.taxablePence || emp.line.grossPence) / 100).toFixed(2),
      ],
      ["Total Tax", ((emp.line.ytdTaxPence || emp.line.taxPence || 0) / 100).toFixed(2)],
      [
        "Student Loans YTD",
        ((emp.line.ytdStudentLoanPence || 0) / 100).toFixed(2),
      ],
      [
        "PostGraduate Loans YTD",
        ((emp.line.ytdPostgraduateLoanPence || 0) / 100).toFixed(2),
      ],
      [
        "Pension (not net pay) YTD",
        ((emp.line.pensionEmployeePence || 0) / 100).toFixed(2),
      ],
    ];

    const right: Array<[string, string]> = [
      ["Pay frequency", emp.payFrequency],
      ["Payment date", ukDate(opts.payDate)],
      ["Month No", String(opts.monthNo)],
      ["Periods Covered", "1"],
      ["Hours Worked", emp.hoursWorkedCode || "D"],
      ["Tax Code", emp.taxCode],
      [
        "Taxable Pay",
        ((emp.line.taxablePence || emp.line.grossPence) / 100).toFixed(2),
      ],
      [
        "Pay after Statutory deductions",
        ((emp.line.netPence || 0) / 100).toFixed(2),
      ],
      [
        "Pension (not net pay)",
        ((emp.line.pensionEmployeePence || 0) / 100).toFixed(2),
      ],
      [
        "Tax deducted or refunded",
        ((emp.line.taxPence || 0) / 100).toFixed(2),
      ],
    ];

    const rows = Math.max(left.length, right.length);
    for (let i = 0; i < rows; i++) {
      if (y < 60) {
        page = doc.addPage(pageSize);
        y = 800;
        header();
      }
      const L = left[i];
      const R = right[i];
      if (L) {
        drawFieldRow(page, font, bold, L[0], L[1], margin, leftRight, y, 8);
      }
      if (R) {
        drawFieldRow(page, font, bold, R[0], R[1], mid + 8, rightRight, y, 8);
      }
      y -= 12;
    }
    y -= 10;
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: 555, y: y + 4 },
      thickness: 0.4,
      color: line,
    });
    y -= 8;
  }

  return Buffer.from(await doc.save());
}

export type RtiSubmissionBlock = {
  submissionNo?: string | null;
  periodFrom: number;
  periodTo: number;
  submittedAt: string;
  correlationId?: string | null;
  rows: Array<{
    name: string;
    staffNo?: string | null;
    taxableGrossPence: number;
    taxPence: number;
    niGrossPence: number;
    employeeNiPence: number;
    employerNiPence: number;
    taxableGrossYtdPence: number;
    niGrossYtdPence: number;
    taxYtdPence: number;
    employeeNiYtdPence: number;
    employerNiYtdPence: number;
  }>;
};

/** Soft-style RTI FPS Submission Detail table. */
export async function buildRtiSubmissionDetailPdf(opts: {
  employerName: string;
  blocks: RtiSubmissionBlock[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595.28]; // landscape A4
  let page = doc.addPage(pageSize);
  let y = 560;
  const margin = 28;

  draw(page, bold, "RTI FPS Submission Detail", margin, y, 14);
  y -= 16;
  draw(page, bold, opts.employerName, margin, y, 11);
  y -= 18;

  const cols = [
    { label: "Employee Name", x: margin, w: 140 },
    { label: "Taxable Grs", x: 175, w: 58 },
    { label: "Tax", x: 235, w: 48 },
    { label: "NI Gross", x: 285, w: 58 },
    { label: "Ee NI", x: 345, w: 48 },
    { label: "Er NI", x: 395, w: 48 },
    { label: "Taxable Grs YTD", x: 445, w: 70 },
    { label: "NI Grs YTD", x: 520, w: 60 },
    { label: "Tax YTD", x: 585, w: 48 },
    { label: "Ee NI YTD", x: 640, w: 55 },
    { label: "Er NI YTD", x: 700, w: 55 },
  ];

  for (const block of opts.blocks) {
    if (y < 80) {
      page = doc.addPage(pageSize);
      y = 560;
      draw(page, bold, "RTI FPS Submission Detail", margin, y, 14);
      y -= 16;
      draw(page, bold, opts.employerName, margin, y, 11);
      y -= 18;
    }
    const sub =
      `Submission No: ${block.submissionNo || "—"} · Period: ${block.periodFrom} to ${block.periodTo}` +
      ` · Date Submitted: ${ukDate(block.submittedAt.slice(0, 10))}` +
      (block.correlationId ? ` · Correlation ID: ${block.correlationId}` : "");
    draw(page, font, sub, margin, y, 8, muted);
    y -= 14;

    for (const c of cols) {
      draw(page, bold, c.label, c.x, y, 7);
    }
    y -= 12;

    let totTaxable = 0;
    let totTax = 0;
    let totNiG = 0;
    let totEe = 0;
    let totEr = 0;
    let totTaxableY = 0;
    let totNiGY = 0;
    let totTaxY = 0;
    let totEeY = 0;
    let totErY = 0;

    for (const row of block.rows) {
      if (y < 40) {
        page = doc.addPage(pageSize);
        y = 560;
      }
      const name =
        row.staffNo && String(row.staffNo).trim()
          ? `${row.name} (${row.staffNo})`
          : row.name;
      draw(page, font, name.slice(0, 36), cols[0]!.x, y, 7);
      drawRight(page, font, gbp(row.taxableGrossPence), cols[1]!.x + cols[1]!.w, y, 7);
      drawRight(page, font, gbp(row.taxPence), cols[2]!.x + cols[2]!.w, y, 7);
      drawRight(page, font, gbp(row.niGrossPence), cols[3]!.x + cols[3]!.w, y, 7);
      drawRight(page, font, gbp(row.employeeNiPence), cols[4]!.x + cols[4]!.w, y, 7);
      drawRight(page, font, gbp(row.employerNiPence), cols[5]!.x + cols[5]!.w, y, 7);
      drawRight(
        page,
        font,
        gbp(row.taxableGrossYtdPence),
        cols[6]!.x + cols[6]!.w,
        y,
        7,
      );
      drawRight(page, font, gbp(row.niGrossYtdPence), cols[7]!.x + cols[7]!.w, y, 7);
      drawRight(page, font, gbp(row.taxYtdPence), cols[8]!.x + cols[8]!.w, y, 7);
      drawRight(
        page,
        font,
        gbp(row.employeeNiYtdPence),
        cols[9]!.x + cols[9]!.w,
        y,
        7,
      );
      drawRight(
        page,
        font,
        gbp(row.employerNiYtdPence),
        cols[10]!.x + cols[10]!.w,
        y,
        7,
      );
      totTaxable += row.taxableGrossPence;
      totTax += row.taxPence;
      totNiG += row.niGrossPence;
      totEe += row.employeeNiPence;
      totEr += row.employerNiPence;
      totTaxableY += row.taxableGrossYtdPence;
      totNiGY += row.niGrossYtdPence;
      totTaxY += row.taxYtdPence;
      totEeY += row.employeeNiYtdPence;
      totErY += row.employerNiYtdPence;
      y -= 11;
    }

    y -= 2;
    draw(page, bold, "Totals", cols[0]!.x, y, 7);
    drawRight(page, bold, gbp(totTaxable), cols[1]!.x + cols[1]!.w, y, 7);
    drawRight(page, bold, gbp(totTax), cols[2]!.x + cols[2]!.w, y, 7);
    drawRight(page, bold, gbp(totNiG), cols[3]!.x + cols[3]!.w, y, 7);
    drawRight(page, bold, gbp(totEe), cols[4]!.x + cols[4]!.w, y, 7);
    drawRight(page, bold, gbp(totEr), cols[5]!.x + cols[5]!.w, y, 7);
    drawRight(page, bold, gbp(totTaxableY), cols[6]!.x + cols[6]!.w, y, 7);
    drawRight(page, bold, gbp(totNiGY), cols[7]!.x + cols[7]!.w, y, 7);
    drawRight(page, bold, gbp(totTaxY), cols[8]!.x + cols[8]!.w, y, 7);
    drawRight(page, bold, gbp(totEeY), cols[9]!.x + cols[9]!.w, y, 7);
    drawRight(page, bold, gbp(totErY), cols[10]!.x + cols[10]!.w, y, 7);
    y -= 22;
  }

  return Buffer.from(await doc.save());
}
