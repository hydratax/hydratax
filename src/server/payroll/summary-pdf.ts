import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PayLine } from "@/server/hmrc/payroll";
import { taxYearLongLabel, ukTaxMonthNumber } from "@/lib/payroll";

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
    .replace(/[^\x00-\x7E£]/g, "?");
}

/** Landscape tabular payroll summary matching the Sofex-style sample. */
export async function renderPayrollSummaryPdfBuffer(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: PayLine[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  // Landscape A4
  const page = doc.addPage([842, 595.28]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width: W, height: H } = page.getSize();
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);

  const taxYear = taxYearLongLabel(opts.payDate);
  const monthNo = ukTaxMonthNumber(opts.payDate);
  const males = opts.lines.filter((l) => l.gender === "M").length;
  const females = opts.lines.filter((l) => l.gender === "F").length;

  let y = H - 36;
  page.drawText(safe(opts.employerName), {
    x: 28,
    y,
    size: 12,
    font: bold,
    color: ink,
  });
  const title = "Payroll Summary for Tax";
  const tw = bold.widthOfTextAtSize(title, 12);
  page.drawText(title, {
    x: (W - tw) / 2,
    y,
    size: 12,
    font: bold,
    color: ink,
  });
  y -= 16;
  page.drawText(`Tax year ${safe(taxYear)}   Month ${monthNo}`, {
    x: 28,
    y,
    size: 9,
    font,
    color: muted,
  });
  page.drawText(`PAYE ${safe(opts.payeRef || "—")}`, {
    x: W - 180,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 18;

  const headers = [
    "Employee Name",
    "Net Pay",
    "Gross Pay",
    "BF Round",
    "SSP",
    "Stat. Parental",
    "Tax Paid",
    "Dedns",
    "CF Round",
    "Net Ee NI",
    "Net Er NI",
    "Payslip Date",
  ];
  // Column x positions (left edges) for landscape
  const xs = [28, 150, 210, 270, 320, 360, 430, 485, 530, 575, 635, 700];

  page.drawLine({
    start: { x: 28, y: y + 10 },
    end: { x: W - 28, y: y + 10 },
    thickness: 0.8,
    color: ink,
  });
  headers.forEach((h, i) => {
    page.drawText(h, { x: xs[i]!, y, size: 7, font: bold, color: ink });
  });
  y -= 4;
  page.drawLine({
    start: { x: 28, y },
    end: { x: W - 28, y },
    thickness: 0.8,
    color: ink,
  });
  y -= 12;

  const totals = {
    net: 0,
    gross: 0,
    ssp: 0,
    parental: 0,
    tax: 0,
    dedns: 0,
    eeNi: 0,
    erNi: 0,
  };

  for (const l of opts.lines) {
    if (y < 60) break;
    const parental =
      (l.smpPence ?? 0) +
      (l.sppPence ?? 0) +
      (l.sapPence ?? 0) +
      (l.shppPence ?? 0) +
      (l.spbpPence ?? 0) +
      (l.sncpPence ?? 0);
    const dedns = l.pensionEmployeePence ?? 0;
    totals.net += l.netPence;
    totals.gross += l.grossPence;
    totals.ssp += l.sspPence ?? 0;
    totals.parental += parental;
    totals.tax += l.taxPence;
    totals.dedns += dedns;
    totals.eeNi += l.employeeNiPence;
    totals.erNi += l.employerNiPence;

    const vals = [
      safe(`${l.surname}, ${l.forename}`).slice(0, 22),
      gbp(l.netPence),
      gbp(l.grossPence),
      "0.00",
      gbp(l.sspPence ?? 0),
      gbp(parental),
      gbp(l.taxPence),
      gbp(dedns),
      "0.00",
      gbp(l.employeeNiPence),
      gbp(l.employerNiPence),
      ukDate(opts.payDate),
    ];
    vals.forEach((v, i) => {
      page.drawText(v, {
        x: xs[i]!,
        y,
        size: 8,
        font: i === 0 ? bold : font,
        color: ink,
      });
    });
    y -= 12;
  }

  y -= 4;
  page.drawLine({
    start: { x: 28, y: y + 10 },
    end: { x: W - 28, y: y + 10 },
    thickness: 0.8,
    color: ink,
  });
  const totVals = [
    "TOTALS",
    gbp(totals.net),
    gbp(totals.gross),
    "0.00",
    gbp(totals.ssp),
    gbp(totals.parental),
    gbp(totals.tax),
    gbp(totals.dedns),
    "0.00",
    gbp(totals.eeNi),
    gbp(totals.erNi),
    "",
  ];
  totVals.forEach((v, i) => {
    if (!v) return;
    page.drawText(v, { x: xs[i]!, y, size: 8, font: bold, color: ink });
  });
  y -= 20;
  page.drawText(`Male: ${males}    Female: ${females}    Total: ${opts.lines.length}`, {
    x: 28,
    y,
    size: 9,
    font,
    color: ink,
  });
  page.drawText(
    `Printed on ${new Date().toLocaleString("en-GB")}    Page 1 of 1`,
    {
      x: 28,
      y: 28,
      size: 7,
      font,
      color: muted,
    },
  );

  return Buffer.from(await doc.save());
}
