import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PayLine } from "@/server/hmrc/payroll";
import { ukTaxMonthNumber } from "@/lib/payroll";

/**
 * Dimensions calibrated against Sofex Furniture March payslip (A4):
 * page 595×842, content ~69% of page height, ~86pt top inset, ~172pt bottom free.
 */
const ink = rgb(0.07, 0.09, 0.15);
const muted = rgb(0.35, 0.38, 0.42);
const band = rgb(0.184, 0.329, 0.588); // #2F5496
const soft = rgb(0.914, 0.941, 0.973); // #E9F0F8
const lineCol = rgb(0.45, 0.55, 0.7); // Sofex uses cooler blue-grey borders

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
  page.drawText(safe(text).slice(0, 140), { x, y, size, font, color });
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
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width: W, height: H } = page.getSize();
  const line = opts.line;

  // Sofex: ~86pt from top, ~40pt side margins
  const margin = 40;
  let y = H - 86;

  const displayName = `${line.forename} ${line.surname}`.trim();
  const addrLines = (line.address || "")
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  // Address only (Sofex) — name is in the ID row
  if (addrLines.length) {
    for (const a of addrLines) {
      drawText(page, font, a, margin, y, 10);
      y -= 13;
    }
  } else {
    drawText(page, font, "—", margin, y, 10, muted);
    y -= 13;
  }
  y -= 14;

  // Identity header — Sofex column widths roughly EmpNo narrow, Name wide, Date, NI
  const idH = 18;
  const cols = [
    { lab: "Employee No", val: line.payrollId || "", w: 95 },
    { lab: "Employee Name", val: displayName, w: 185 },
    { lab: "Process Date", val: ukDate(opts.payDate), w: 100 },
    {
      lab: "National Insurance Number",
      val: line.nino || "",
      w: W - margin * 2 - 95 - 185 - 100,
    },
  ];
  let x = margin;
  for (const c of cols) {
    page.drawRectangle({
      x,
      y: y - idH,
      width: c.w,
      height: idH,
      color: band,
      borderColor: band,
      borderWidth: 0.5,
    });
    drawText(page, bold, c.lab, x + 4, y - 12, 7.5, rgb(1, 1, 1));
    x += c.w;
  }
  y -= idH;
  x = margin;
  for (const c of cols) {
    page.drawRectangle({
      x,
      y: y - idH,
      width: c.w,
      height: idH,
      borderColor: lineCol,
      borderWidth: 0.6,
    });
    drawText(page, font, c.val, x + 4, y - 12, 9.5);
    x += c.w;
  }
  y -= idH + 10;

  // Payments | Deductions — Sofex uses a TALL soft panel (~200pt body)
  const mid = margin + Math.round((W - margin * 2) * 0.58);
  const right = W - margin;
  const headH = 16;
  const unitsX = mid - 118;
  const rateX = mid - 68;
  const amtX = mid - 8;

  page.drawRectangle({
    x: margin,
    y: y - headH,
    width: mid - margin,
    height: headH,
    color: band,
  });
  page.drawRectangle({
    x: mid,
    y: y - headH,
    width: right - mid,
    height: headH,
    color: band,
  });
  drawText(page, bold, "Payments", margin + 5, y - 11, 8.5, rgb(1, 1, 1));
  drawRight(page, bold, "Units", unitsX, y - 11, 8.5, rgb(1, 1, 1));
  drawRight(page, bold, "Rate", rateX, y - 11, 8.5, rgb(1, 1, 1));
  drawRight(page, bold, "Amount", amtX, y - 11, 8.5, rgb(1, 1, 1));
  drawText(page, bold, "Deductions", mid + 5, y - 11, 8.5, rgb(1, 1, 1));
  drawRight(page, bold, "Amount", right - 5, y - 11, 8.5, rgb(1, 1, 1));
  y -= headH;

  // Tall soft body matching Sofex empty blue well under few rows
  const bodyH = 240;
  page.drawRectangle({
    x: margin,
    y: y - bodyH,
    width: mid - margin,
    height: bodyH,
    color: soft,
    borderColor: lineCol,
    borderWidth: 0.6,
  });
  page.drawRectangle({
    x: mid,
    y: y - bodyH,
    width: right - mid,
    height: bodyH,
    color: soft,
    borderColor: lineCol,
    borderWidth: 0.6,
  });
  // Divider between pay / deduct
  page.drawLine({
    start: { x: mid, y: y },
    end: { x: mid, y: y - bodyH },
    thickness: 0.6,
    color: lineCol,
  });

  const hoursNum =
    line.hoursPerWeekHundredths > 0 ? line.hoursPerWeekHundredths / 100 : 0;
  const basic = line.ordinaryPence || line.grossPence;
  const rateFromLine = Number(
    (line as { hourlyRatePence?: number }).hourlyRatePence ?? 0,
  );
  const ratePence =
    rateFromLine > 0
      ? rateFromLine
      : hoursNum > 0
        ? Math.round(basic / hoursNum)
        : 0;

  let py = y - 16;
  drawText(page, font, "Basic Pay", margin + 6, py, 10);
  if (hoursNum > 0) drawRight(page, font, hoursNum.toFixed(2), unitsX, py, 10);
  if (ratePence > 0) drawRight(page, font, gbp(ratePence), rateX, py, 10);
  drawRight(page, font, gbp(basic), amtX, py, 10);
  py -= 15;
  if ((line.overtimePence ?? 0) > 0) {
    drawText(page, font, "Overtime", margin + 6, py, 10);
    drawRight(page, font, gbp(line.overtimePence!), amtX, py, 10);
    py -= 15;
  }
  if ((line.holidayPence ?? 0) > 0) {
    drawText(page, font, "Holiday Pay", margin + 6, py, 10);
    drawRight(page, font, gbp(line.holidayPence!), amtX, py, 10);
    py -= 15;
  }
  if ((line.sspPence ?? 0) > 0) {
    drawText(page, font, "SSP", margin + 6, py, 10);
    drawRight(page, font, gbp(line.sspPence!), amtX, py, 10);
    py -= 15;
  }
  if ((line.smpPence ?? 0) > 0) {
    drawText(page, font, "SMP", margin + 6, py, 10);
    drawRight(page, font, gbp(line.smpPence!), amtX, py, 10);
  }

  let dy = y - 16;
  const deductions: Array<[string, number]> = [
    ["PAYE Tax", line.taxPence],
    ["National Insurance", line.employeeNiPence],
  ];
  if ((line.studentLoanPence ?? 0) > 0) {
    deductions.push(["Student loan", line.studentLoanPence!]);
  }
  if ((line.postgraduateLoanPence ?? 0) > 0) {
    deductions.push(["Postgraduate loan", line.postgraduateLoanPence!]);
  }
  if ((line.pensionEmployeePence ?? 0) > 0) {
    deductions.push(["Pension", line.pensionEmployeePence!]);
  }
  for (const [lab, val] of deductions) {
    drawText(page, font, lab, mid + 6, dy, 10);
    drawRight(page, font, gbp(val), right - 6, dy, 10);
    dy -= 15;
  }
  y -= bodyH + 12;

  // This Period / Year to Date — Sofex sized boxes
  const gap = 10;
  const boxW = (W - margin * 2 - gap) / 2;
  const boxH = 112;
  const rowH = 15;
  for (const [i, title] of ["This Period", "Year to Date"].entries()) {
    const bx = margin + i * (boxW + gap);
    page.drawRectangle({
      x: bx,
      y: y - 16,
      width: boxW,
      height: 16,
      color: band,
    });
    drawText(page, bold, title, bx + 5, y - 12, 9.5, rgb(1, 1, 1));
    page.drawRectangle({
      x: bx,
      y: y - boxH,
      width: boxW,
      height: boxH - 16,
      borderColor: lineCol,
      borderWidth: 0.7,
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
    const yy = y - 30 - i * rowH;
    drawText(page, font, lab, margin + 6, yy, 9.5);
    drawRight(page, font, gbp(val), margin + boxW - 6, yy, 9.5);
  });
  ytdRows.forEach(([lab, val], i) => {
    const yy = y - 30 - i * rowH;
    const bx = margin + boxW + gap;
    drawText(page, font, lab, bx + 6, yy, 9.5);
    drawRight(page, font, gbp(val), bx + boxW - 6, yy, 9.5);
  });
  y -= boxH + 12;

  // Company meta — Sofex full-width bordered box
  const taxBasis = opts.frequency === "W1" ? "W1" : "M1";
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const detail = `Tax Code: ${line.taxCode} ${taxBasis}   Tax Period: ${ukTaxMonthNumber(opts.payDate)}   Frequency: ${freq}   Payment Method: BACS   PAYE Reference: ${opts.payeRef || "—"}`;
  page.drawRectangle({
    x: margin,
    y: y - 44,
    width: W - margin * 2,
    height: 44,
    borderColor: lineCol,
    borderWidth: 0.7,
  });
  drawText(page, bold, opts.employerName, margin + 8, y - 16, 11);
  drawText(page, font, detail.slice(0, 125), margin + 8, y - 32, 8.5);
  y -= 58;

  // Employer pension + Net pay — Sofex: larger Net Pay label in band blue
  page.drawRectangle({
    x: margin,
    y: y - 34,
    width: 175,
    height: 34,
    borderColor: lineCol,
    borderWidth: 0.7,
  });
  drawText(page, font, "Employer Pension:", margin + 8, y - 21, 10);
  drawText(
    page,
    bold,
    gbp(line.pensionEmployerPence ?? 0),
    margin + 118,
    y - 21,
    11,
  );

  page.drawRectangle({
    x: W - margin - 230,
    y: y - 34,
    width: 230,
    height: 34,
    color: soft,
    borderColor: lineCol,
    borderWidth: 0.7,
  });
  drawText(page, bold, "Net Pay", W - margin - 216, y - 22, 14, band);
  drawRight(page, bold, gbp(line.netPence), W - margin - 10, y - 22, 14);

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
