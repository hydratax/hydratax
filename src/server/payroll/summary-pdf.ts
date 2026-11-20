import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

function monthKey(iso: string) {
  return iso.slice(0, 7); // YYYY-MM
}

function monthTitle(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export type SummaryPayLine = PayLine & { payslipDate?: string };

type Acc = {
  net: number;
  gross: number;
  ssp: number;
  parental: number;
  tax: number;
  dedns: number;
  eeNi: number;
  erNi: number;
};

function emptyAcc(): Acc {
  return {
    net: 0,
    gross: 0,
    ssp: 0,
    parental: 0,
    tax: 0,
    dedns: 0,
    eeNi: 0,
    erNi: 0,
  };
}

/**
 * Landscape payroll summary — Sofex style.
 * Multi-month ranges are clearly divided: month banner → rows → month TOTALS.
 */
export async function renderPayrollSummaryPdfBuffer(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: SummaryPayLine[];
  rangeLabel?: string;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);
  const band = rgb(0.184, 0.329, 0.588);
  const soft = rgb(0.914, 0.941, 0.973);

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
  const xs = [28, 150, 210, 270, 320, 360, 430, 485, 530, 575, 635, 700];

  // Group by calendar month of payslip date
  const groups = new Map<string, SummaryPayLine[]>();
  for (const l of opts.lines) {
    const slip = l.payslipDate || opts.payDate;
    const key = monthKey(slip);
    const list = groups.get(key) ?? [];
    list.push({ ...l, payslipDate: slip });
    groups.set(key, list);
  }
  const monthKeys = [...groups.keys()].sort();

  let page = doc.addPage([842, 595.28]);
  let { width: W, height: H } = page.getSize();
  let y = H - 36;
  let pageNo = 1;
  const grand = emptyAcc();
  let males = 0;
  let females = 0;

  function drawDocHeader() {
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
    const periodBits = opts.rangeLabel
      ? `Period ${safe(opts.rangeLabel)}`
      : `Tax year ${safe(taxYearLongLabel(opts.payDate))}   Month ${ukTaxMonthNumber(opts.payDate)}`;
    page.drawText(periodBits, {
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
    y -= 14;
  }

  function drawColumnHeaders() {
    page.drawLine({
      start: { x: 28, y: y + 8 },
      end: { x: W - 28, y: y + 8 },
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
  }

  function footer() {
    page.drawText(
      `Printed on ${new Date().toLocaleString("en-GB")}    Page ${pageNo}`,
      {
        x: 28,
        y: 28,
        size: 7,
        font,
        color: muted,
      },
    );
  }

  function newPage() {
    footer();
    page = doc.addPage([842, 595.28]);
    ({ width: W, height: H } = page.getSize());
    y = H - 36;
    pageNo += 1;
    drawDocHeader();
    drawColumnHeaders();
  }

  function needSpace(pts: number) {
    if (y < pts) newPage();
  }

  function drawTotalsRow(label: string, acc: Acc, size = 8) {
    page.drawLine({
      start: { x: 28, y: y + 10 },
      end: { x: W - 28, y: y + 10 },
      thickness: 0.8,
      color: ink,
    });
    const vals = [
      label,
      gbp(acc.net),
      gbp(acc.gross),
      "0.00",
      gbp(acc.ssp),
      gbp(acc.parental),
      gbp(acc.tax),
      gbp(acc.dedns),
      "0.00",
      gbp(acc.eeNi),
      gbp(acc.erNi),
      "",
    ];
    vals.forEach((v, i) => {
      if (!v) return;
      page.drawText(v, { x: xs[i]!, y, size, font: bold, color: ink });
    });
    y -= 14;
  }

  drawDocHeader();
  drawColumnHeaders();

  for (const key of monthKeys) {
    const rows = groups.get(key)!;
    rows.sort((a, b) =>
      `${a.surname} ${a.forename}`.localeCompare(
        `${b.surname} ${b.forename}`,
        "en-GB",
      ),
    );
    const sampleDate = rows[0]?.payslipDate || `${key}-01`;
    const taxYear = taxYearLongLabel(sampleDate);
    const monthNo = ukTaxMonthNumber(sampleDate);

    // Month divider band (Sofex: clear month break)
    needSpace(56 + rows.length * 12 + 28);
    page.drawRectangle({
      x: 28,
      y: y - 4,
      width: W - 56,
      height: 16,
      color: soft,
      borderColor: band,
      borderWidth: 0.6,
    });
    drawText(
      page,
      bold,
      `${monthTitle(sampleDate)}   ·   Tax year ${taxYear}   ·   Month ${monthNo}`,
      34,
      y,
      9,
      band,
    );
    y -= 20;

    const monthAcc = emptyAcc();
    for (const l of rows) {
      needSpace(48);
      const parental =
        (l.smpPence ?? 0) +
        (l.sppPence ?? 0) +
        (l.sapPence ?? 0) +
        (l.shppPence ?? 0) +
        (l.spbpPence ?? 0) +
        (l.sncpPence ?? 0);
      monthAcc.net += l.netPence;
      monthAcc.gross += l.grossPence;
      monthAcc.ssp += l.sspPence ?? 0;
      monthAcc.parental += parental;
      monthAcc.tax += l.taxPence;
      monthAcc.dedns += l.pensionEmployeePence ?? 0;
      monthAcc.eeNi += l.employeeNiPence;
      monthAcc.erNi += l.employerNiPence;

      // draw row without double-counting grand in drawEmployeeRow — inline
      if (l.gender === "M") males += 1;
      if (l.gender === "F") females += 1;
      grand.net += l.netPence;
      grand.gross += l.grossPence;
      grand.ssp += l.sspPence ?? 0;
      grand.parental += parental;
      grand.tax += l.taxPence;
      grand.dedns += l.pensionEmployeePence ?? 0;
      grand.eeNi += l.employeeNiPence;
      grand.erNi += l.employerNiPence;

      const slip = l.payslipDate || sampleDate;
      const vals = [
        safe(`${l.surname}, ${l.forename}`).slice(0, 22),
        gbp(l.netPence),
        gbp(l.grossPence),
        "0.00",
        gbp(l.sspPence ?? 0),
        gbp(parental),
        gbp(l.taxPence),
        gbp(l.pensionEmployeePence ?? 0),
        "0.00",
        gbp(l.employeeNiPence),
        gbp(l.employerNiPence),
        ukDate(slip),
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

    needSpace(40);
    drawTotalsRow(`TOTALS · ${monthTitle(sampleDate)}`, monthAcc);
    y -= 6;
  }

  if (monthKeys.length > 1) {
    needSpace(50);
    drawTotalsRow("GRAND TOTALS", grand, 9);
  }

  needSpace(40);
  page.drawText(
    `Male: ${males}    Female: ${females}    Rows: ${opts.lines.length}    Months: ${monthKeys.length}`,
    {
      x: 28,
      y,
      size: 9,
      font,
      color: ink,
    },
  );
  footer();

  return Buffer.from(await doc.save());
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(safe(text).slice(0, 120), { x, y, size, font, color });
}
