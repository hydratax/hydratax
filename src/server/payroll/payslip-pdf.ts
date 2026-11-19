import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PayLine } from "@/server/hmrc/payroll";
import { ukTaxMonthNumber } from "@/lib/payroll";

const ink = rgb(0.06, 0.09, 0.14);
const muted = rgb(0.35, 0.4, 0.48);
const band = rgb(0.12, 0.31, 0.55);
const bandSoft = rgb(0.91, 0.94, 0.98);

function gbp(pence: number) {
  return ((pence || 0) / 100).toFixed(2);
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

function drawText(
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

/** Sofex-style UK payslip (navy bars, payments/deductions, YTD, net pay). */
export async function renderPayslipPdfBuffer(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  line: PayLine;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  /** Helvetica for money — proportional sans; columns stay aligned via drawRight. */
  const digits = font;
  const digitsBold = bold;
  const { width: W, height: H } = page.getSize();
  const line = opts.line;
  const margin = 36;
  let y = H - 40;

  const addrLines = (line.address || "")
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  drawText(page, bold, `${line.forename} ${line.surname}`, margin, y, 12);
  y -= 14;
  for (const a of addrLines) {
    drawText(page, font, a, margin, y, 10, muted);
    y -= 12;
  }
  if (addrLines.length === 0) {
    drawText(page, font, "—", margin, y, 10, muted);
    y -= 12;
  }
  y -= 8;

  // Identity bar
  const barH = 36;
  page.drawRectangle({
    x: margin,
    y: y - barH,
    width: W - margin * 2,
    height: barH,
    color: band,
  });
  const cols = [
    { lab: "Employee No", val: line.payrollId || "—" },
    { lab: "Employee Name", val: `${line.forename} ${line.surname}` },
    { lab: "Process Date", val: ukDate(opts.payDate) },
    { lab: "National Insurance Number", val: line.nino },
  ];
  const colW = (W - margin * 2) / 4;
  cols.forEach((c, i) => {
    const x = margin + i * colW + 8;
    drawText(page, font, c.lab, x, y - 12, 7, rgb(1, 1, 1));
    drawText(page, bold, c.val, x, y - 26, 9, rgb(1, 1, 1));
  });
  y -= barH + 14;

  // Payments / Deductions headers
  const mid = margin + (W - margin * 2) * 0.58;
  const right = W - margin;
  page.drawRectangle({
    x: margin,
    y: y - 18,
    width: mid - margin - 6,
    height: 18,
    color: band,
  });
  page.drawRectangle({
    x: mid,
    y: y - 18,
    width: right - mid,
    height: 18,
    color: band,
  });
  drawText(page, bold, "Payments", margin + 6, y - 13, 9, rgb(1, 1, 1));
  drawText(page, bold, "Units", mid - 90, y - 13, 8, rgb(1, 1, 1));
  drawText(page, bold, "Rate", mid - 50, y - 13, 8, rgb(1, 1, 1));
  drawRight(page, bold, "Amount", mid - 10, y - 13, 8, rgb(1, 1, 1));
  drawText(page, bold, "Deductions", mid + 6, y - 13, 9, rgb(1, 1, 1));
  drawRight(page, bold, "Amount", right - 6, y - 13, 8, rgb(1, 1, 1));
  y -= 18;

  const payRowsH = 72;
  page.drawRectangle({
    x: margin,
    y: y - payRowsH,
    width: mid - margin - 6,
    height: payRowsH,
    color: bandSoft,
  });
  page.drawRectangle({
    x: mid,
    y: y - payRowsH,
    width: right - mid,
    height: payRowsH,
    color: bandSoft,
  });

  const hours =
    line.hoursPerWeekHundredths > 0
      ? (line.hoursPerWeekHundredths / 100).toFixed(2)
      : "";
  const basic = line.ordinaryPence || line.grossPence;
  let py = y - 14;
  drawText(page, font, "Basic Pay", margin + 6, py, 9);
  if (hours) drawRight(page, digits, hours, mid - 70, py, 9);
  drawRight(page, digits, gbp(basic), mid - 10, py, 9);
  py -= 14;
  if ((line.overtimePence ?? 0) > 0) {
    drawText(page, font, "Overtime", margin + 6, py, 9);
    drawRight(page, digits, gbp(line.overtimePence!), mid - 10, py, 9);
    py -= 14;
  }
  if ((line.sspPence ?? 0) > 0) {
    drawText(page, font, "SSP", margin + 6, py, 9);
    drawRight(page, digits, gbp(line.sspPence!), mid - 10, py, 9);
    py -= 14;
  }
  if ((line.smpPence ?? 0) > 0) {
    drawText(page, font, "SMP", margin + 6, py, 9);
    drawRight(page, digits, gbp(line.smpPence!), mid - 10, py, 9);
  }

  let dy = y - 14;
  drawText(page, font, "PAYE Tax", mid + 6, dy, 9);
  drawRight(page, digits, gbp(line.taxPence), right - 6, dy, 9);
  dy -= 14;
  drawText(page, font, "National Insurance", mid + 6, dy, 9);
  drawRight(page, digits, gbp(line.employeeNiPence), right - 6, dy, 9);
  dy -= 14;
  if ((line.studentLoanPence ?? 0) > 0) {
    drawText(page, font, "Student loan", mid + 6, dy, 9);
    drawRight(page, digits, gbp(line.studentLoanPence!), right - 6, dy, 9);
    dy -= 14;
  }
  if ((line.postgraduateLoanPence ?? 0) > 0) {
    drawText(page, font, "Postgraduate loan", mid + 6, dy, 9);
    drawRight(page, digits, gbp(line.postgraduateLoanPence!), right - 6, dy, 9);
    dy -= 14;
  }
  if ((line.pensionEmployeePence ?? 0) > 0) {
    drawText(page, font, "Pension", mid + 6, dy, 9);
    drawRight(page, digits, gbp(line.pensionEmployeePence!), right - 6, dy, 9);
  }
  y -= payRowsH + 12;

  // This period / YTD boxes
  const boxW = (W - margin * 2 - 10) / 2;
  const boxH = 100;
  for (const [i, title] of ["This period", "Year to date"].entries()) {
    const x = margin + i * (boxW + 10);
    page.drawRectangle({
      x,
      y: y - 18,
      width: boxW,
      height: 18,
      color: bandSoft,
      borderColor: rgb(0.7, 0.75, 0.8),
      borderWidth: 0.8,
    });
    drawText(page, bold, title, x + 6, y - 13, 9);
    page.drawRectangle({
      x,
      y: y - boxH,
      width: boxW,
      height: boxH - 18,
      borderColor: rgb(0.7, 0.75, 0.8),
      borderWidth: 0.8,
    });
  }
  const periodRows: [string, number][] = [
    ["Total Gross Pay", line.grossPence],
    ["Gross for Tax", line.taxablePence ?? line.grossPence],
    ["Gross for NI", line.grossPence],
    ["Taxable Benefits", 0],
    ["NI ER", line.employerNiPence],
  ];
  const ytdRows: [string, number][] = [
    ["Total Gross Pay TD", line.ytdGrossPence],
    ["Gross for Tax TD", line.ytdTaxablePence ?? line.ytdGrossPence],
    ["Tax Paid TD", line.ytdTaxPence],
    ["Gross for NI TD", line.ytdGrossPence],
    ["National Insurance TD", line.ytdEmployeeNiPence],
  ];
  periodRows.forEach(([lab, val], i) => {
    const yy = y - 34 - i * 12;
    drawText(page, font, lab, margin + 6, yy, 9);
    drawRight(page, digits, gbp(val), margin + boxW - 6, yy, 9);
  });
  ytdRows.forEach(([lab, val], i) => {
    const yy = y - 34 - i * 12;
    drawText(page, font, lab, margin + boxW + 16, yy, 9);
    drawRight(page, digits, gbp(val), margin + boxW * 2 + 10 - 6, yy, 9);
  });
  y -= boxH + 12;

  // Meta strip
  const meta: [string, string][] = [
    ["Company Name", opts.employerName],
    ["Tax Code", `${line.taxCode} ${opts.frequency === "W1" ? "W1" : "M1"}`],
    ["Tax Period", String(ukTaxMonthNumber(opts.payDate))],
    ["Frequency", opts.frequency === "W1" ? "Weekly" : "Monthly"],
    ["Payment Method", "BACS"],
    ["PAYE Reference", opts.payeRef || "—"],
  ];
  page.drawRectangle({
    x: margin,
    y: y - 48,
    width: W - margin * 2,
    height: 48,
    borderColor: rgb(0.7, 0.75, 0.8),
    borderWidth: 0.8,
  });
  meta.forEach(([lab, val], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + 6 + col * ((W - margin * 2) / 3);
    const yy = y - 14 - row * 22;
    drawText(page, font, lab, x, yy, 7, muted);
    drawText(page, bold, val, x, yy - 11, 9);
  });
  y -= 60;

  // Employer pension + Net pay
  page.drawRectangle({
    x: margin,
    y: y - 40,
    width: 140,
    height: 40,
    borderColor: rgb(0.7, 0.75, 0.8),
    borderWidth: 0.8,
  });
  drawText(page, font, "Employer Pension", margin + 8, y - 14, 7, muted);
  drawText(
    page,
    digitsBold,
    gbp(line.pensionEmployerPence ?? 0),
    margin + 8,
    y - 30,
    12,
  );

  page.drawRectangle({
    x: W - margin - 200,
    y: y - 40,
    width: 200,
    height: 40,
    color: band,
  });
  drawText(page, font, "Net Pay", W - margin - 190, y - 14, 8, rgb(1, 1, 1));
  drawRight(
    page,
    digitsBold,
    gbp(line.netPence),
    W - margin - 10,
    y - 32,
    18,
    rgb(1, 1, 1),
  );

  return Buffer.from(await doc.save());
}

export function payslipPdfFileName(forename: string, payDate: string) {
  const d = new Date(`${payDate}T12:00:00`);
  const month = Number.isNaN(d.getTime())
    ? "Month"
    : d.toLocaleString("en-GB", { month: "long" });
  const year = Number.isNaN(d.getTime())
    ? payDate.slice(0, 4)
    : String(d.getFullYear());
  const name = (forename || "Employee").replace(/[^a-zA-Z0-9]+/g, "");
  return `${name}_${month}_${year}.pdf`;
}

export function summaryPdfFileName(payDate: string) {
  const d = new Date(`${payDate}T12:00:00`);
  const month = Number.isNaN(d.getTime())
    ? "Month"
    : d.toLocaleString("en-GB", { month: "long" });
  const year = Number.isNaN(d.getTime())
    ? payDate.slice(0, 4)
    : String(d.getFullYear());
  return `Payroll_Summary_${month}_${year}.pdf`;
}
