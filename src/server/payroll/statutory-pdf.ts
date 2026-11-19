import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { YtdTotals } from "@/server/hmrc/payroll";
import type { PayLine } from "@/server/hmrc/payroll";
import type { StatutoryEmployee, StatutoryEmployer } from "@/server/payroll/statutory-forms";

/**
 * Fill official HMRC stationery:
 * - P60 single sheet blank
 * - P45(Continuous) Parts 1 / 1A / 2 / 3 (watermark stripped from clean template)
 */

const ink = rgb(0, 0, 0);

function moneyParts(pence: number) {
  const n = Math.max(0, Math.round(pence || 0));
  return {
    pounds: String(Math.floor(n / 100)),
    pence: String(n % 100).padStart(2, "0"),
  };
}

function taxYearEndYear(taxYear: string): string {
  const parts = taxYear.split(/[-–]/);
  const end = parts[parts.length - 1] || "";
  if (end.length === 2) {
    const n = Number(end);
    return String(n > 50 ? 1900 + n : 2000 + n);
  }
  return end || String(new Date().getFullYear());
}

/** Convert PyMuPDF top-left box bottom edge to pdf-lib baseline y. */
function baseFromTop(pageH: number, topY: number, boxH: number, inset = 5) {
  return pageH - (topY + boxH) + inset;
}

function drawInBox(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  topY: number,
  w: number,
  h: number,
  size = 10,
  align: "left" | "right" = "left",
) {
  const pageH = page.getHeight();
  const y = baseFromTop(pageH, topY, h, Math.max(3, (h - size) / 2));
  const t = String(text || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x00-\x7E£]/g, "?")
    .slice(0, 80);
  const tw = font.widthOfTextAtSize(t, size);
  const drawX = align === "right" ? x + w - tw - 3 : x + 3;
  page.drawText(t, { x: Math.max(x + 1, drawX), y, size, font, color: ink });
}

function drawMoneyBox(
  page: PDFPage,
  font: PDFFont,
  pence: number,
  box: { x: number; y: number; w: number; h: number; splitX: number },
) {
  const { pounds, pence: p } = moneyParts(pence);
  const poundsW = box.splitX - box.x - 2;
  drawInBox(page, font, pounds, box.x, box.y, poundsW, box.h, 10, "right");
  const penceW = box.x + box.w - box.splitX - 2;
  drawInBox(page, font, p, box.splitX + 2, box.y, penceW, box.h, 10, "left");
}

async function loadTemplate(rel: string) {
  const full = path.join(process.cwd(), "public", "hmrc", rel);
  return readFile(full);
}

export async function renderP60Pdf(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  totals: YtdTotals;
  previousEmployment?: YtdTotals | null;
  issuedAt?: string;
}) {
  const bytes = await loadTemplate("P60_Single_Sheet_2025_2026.pdf");
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[0]!;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const prev = opts.previousEmployment;
  const prevPay = prev?.taxablePence ?? prev?.grossPence ?? 0;
  const prevTax = prev?.taxPence ?? 0;
  const thisPay = opts.totals.taxablePence ?? opts.totals.grossPence;
  const thisTax = opts.totals.taxPence;
  const totalPay = prevPay + thisPay;
  const totalTax = prevTax + thisTax;

  // Employee name box (surname top half / forenames bottom half)
  drawInBox(page, bold, opts.employee.surname, 370, 42.1, 180, 22, 11);
  drawInBox(page, bold, opts.employee.forename, 370, 64.6, 180, 22, 11);
  // NINO + payroll id
  drawInBox(page, bold, opts.employee.nino, 273.7, 102.3, 136.5, 22.3, 11);
  drawInBox(page, bold, opts.employee.payrollId, 417.7, 102.2, 136.5, 22.4, 10);

  // Pay / tax money grids
  drawMoneyBox(page, bold, prevPay, {
    x: 345.7,
    y: 174.2,
    w: 100.5,
    h: 22.4,
    splitX: 421.2,
  });
  drawMoneyBox(page, bold, prevTax, {
    x: 453.7,
    y: 174.2,
    w: 100.5,
    h: 22.4,
    splitX: 529.2,
  });
  drawMoneyBox(page, bold, thisPay, {
    x: 346.5,
    y: 210.0,
    w: 100.2,
    h: 24.4,
    splitX: 421.2,
  });
  drawMoneyBox(page, bold, thisTax, {
    x: 454.5,
    y: 210.0,
    w: 100.2,
    h: 24.4,
    splitX: 529.2,
  });
  drawMoneyBox(page, bold, totalPay, {
    x: 345.7,
    y: 245.8,
    w: 100.5,
    h: 22.4,
    splitX: 421.2,
  });
  drawMoneyBox(page, bold, totalTax, {
    x: 453.7,
    y: 245.8,
    w: 100.5,
    h: 22.4,
    splitX: 529.2,
  });

  // Final tax code (right field on that row)
  drawInBox(page, bold, opts.employee.taxCode, 453.7, 280.3, 100.5, 22.4, 11);

  // NIC table letter
  drawInBox(page, bold, opts.employee.niCategory || "A", 51.1, 420.3, 28.5, 28, 14);

  // Employee NI due
  const eeNi = moneyParts(opts.totals.employeeNiPence);
  drawInBox(
    page,
    bold,
    `${eeNi.pounds}.${eeNi.pence}`,
    368.6,
    420.3,
    93.3,
    28,
    10,
    "right",
  );

  // Statutory payments
  const smp = moneyParts(opts.totals.smpPence ?? 0);
  const spp = moneyParts(opts.totals.sppPence ?? 0);
  const shpp = moneyParts(opts.totals.shppPence ?? 0);
  const sap = moneyParts(opts.totals.sapPence ?? 0);
  const spbp = moneyParts(opts.totals.spbpPence ?? 0);
  const sncp = moneyParts(opts.totals.sncpPence ?? 0);
  drawInBox(page, font, `${smp.pounds}.${smp.pence}`, 93.1, 551.7, 100.6, 22.4, 10, "right");
  drawInBox(page, font, `${spp.pounds}.${spp.pence}`, 292.2, 552.7, 84.8, 22.4, 10, "right");
  drawInBox(page, font, `${shpp.pounds}.${shpp.pence}`, 457.2, 552.2, 84.8, 22.4, 10, "right");
  drawInBox(page, font, `${sap.pounds}.${sap.pence}`, 91.7, 590.3, 100.5, 22.4, 10, "right");
  drawInBox(page, font, `${spbp.pounds}.${spbp.pence}`, 292.2, 590.8, 84.8, 22.4, 10, "right");
  drawInBox(page, font, `${sncp.pounds}.${sncp.pence}`, 457.2, 590.5, 84.8, 22.4, 10, "right");

  // Student / PG loans = 0
  drawInBox(page, font, "0", 195.3, 648.9, 100.6, 22.4, 10, "right");
  drawInBox(page, font, "0", 195.3, 689.9, 100.6, 22.4, 10, "right");

  // Employer name / address / PAYE
  const empLines = [
    opts.employer.name,
    ...(opts.employer.address || "")
      .split(/,\s*|\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  ].slice(0, 4);
  let ey = 634.7;
  for (const line of empLines) {
    drawInBox(page, font, line, 324.0, ey, 230.5, 14, 9);
    ey += 14;
  }
  drawInBox(page, bold, opts.employer.payeRef || "—", 414.8, 703.3, 139.5, 23.8, 10);

  // Year already printed on blank; reinforce if blank year box empty
  void taxYearEndYear(opts.taxYear);

  return Buffer.from(await doc.save());
}

function splitPostcode(address: string | null | undefined) {
  const raw = (address || "").trim();
  const m = raw.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
  if (!m) return { lines: raw ? [raw] : [], postcode: "" };
  const postcode = m[1]!.toUpperCase().replace(/\s+/, " ");
  const lines = raw
    .slice(0, m.index)
    .replace(/,\s*$/, "")
    .split(/,\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { lines, postcode };
}

function drawP45Money(
  page: PDFPage,
  font: PDFFont,
  amountPence: number,
  pounds: { x: number; y: number; w: number; h: number },
  penceBox: { x: number; y: number; w: number; h: number },
) {
  const { pounds: p, pence: c } = moneyParts(amountPence);
  drawInBox(page, font, p, pounds.x, pounds.y, pounds.w, pounds.h, 10, "right");
  drawInBox(page, font, c, penceBox.x, penceBox.y, penceBox.w, penceBox.h, 9, "left");
}

function drawP45DateBoxes(
  page: PDFPage,
  font: PDFFont,
  iso: string | null | undefined,
  dd: { x: number; y: number; w: number; h: number },
  mm: { x: number; y: number; w: number; h: number },
  yyyy: { x: number; y: number; w: number; h: number },
) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  const [y, m, d] = iso.split("-");
  drawInBox(page, font, d!, dd.x, dd.y, dd.w, dd.h, 10);
  drawInBox(page, font, m!, mm.x, mm.y, mm.w, mm.h, 10);
  drawInBox(page, font, y!, yyyy.x, yyyy.y, yyyy.w, yyyy.h, 10);
}

/** Shared leaving fields (boxes 1–7) on every continuous P45 part. */
function fillP45LeavingCore(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  opts: {
    employer: StatutoryEmployer;
    employee: StatutoryEmployee;
    leaveDate: string;
    totals: YtdTotals;
  },
) {
  const paye = (opts.employer.payeRef || "").split("/");
  const office = paye[0] || "";
  const ref = paye.slice(1).join("/") || "";
  const pay = opts.totals.taxablePence ?? opts.totals.grossPence;
  const tax = opts.totals.taxPence;

  // 1 Employer PAYE reference
  drawInBox(page, bold, office, 116.5, 139.5, 44.4, 16, 10);
  drawInBox(page, bold, ref, 180.2, 139.5, 152.1, 16, 10);
  // 2 NINO
  drawInBox(page, bold, opts.employee.nino, 116.5, 187.6, 215.9, 16, 11);
  // 3 Title / surname / forenames (title unknown — leave blank)
  drawInBox(page, bold, opts.employee.surname.toUpperCase(), 116.5, 271.5, 215.9, 16, 10);
  drawInBox(page, bold, opts.employee.forename.toUpperCase(), 116.5, 307.5, 215.9, 16, 10);
  // 4 Leaving date
  drawP45DateBoxes(
    page,
    bold,
    opts.leaveDate,
    { x: 116.5, y: 355.5, w: 27.3, h: 16 },
    { x: 154.7, y: 355.5, w: 27.3, h: 16 },
    { x: 193.0, y: 355.5, w: 55.7, h: 16 },
  );
  // 6 Tax code (cumulative — no Week1/Month1 X)
  drawInBox(page, bold, opts.employee.taxCode, 384.3, 175.5, 120.9, 16, 10);
  // 7 Total pay / tax to date
  drawP45Money(
    page,
    bold,
    pay,
    { x: 400.9, y: 331.5, w: 176.4, h: 16 },
    { x: 580.6, y: 331.0, w: 14.2, h: 17 },
  );
  drawP45Money(
    page,
    bold,
    tax,
    { x: 400.9, y: 367.5, w: 176.4, h: 16 },
    { x: 580.6, y: 367.0, w: 14.2, h: 17 },
  );
}

/** Boxes 8–13 on Part 1 and Part 1A. */
function fillP45LeavingExtended(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  opts: {
    employer: StatutoryEmployer;
    employee: StatutoryEmployee;
    totals: YtdTotals;
    issuedAt: string;
  },
) {
  // Box 8 left blank when same as box 7 (cumulative) — HMRC instruction.
  // 9 Works / payroll number
  drawInBox(page, bold, opts.employee.payrollId, 116.5, 542.5, 215.9, 33, 11);
  // 10 Gender
  if (opts.employee.gender === "M") {
    drawInBox(page, bold, "X", 147.6, 607.5, 13.2, 16, 11);
  } else if (opts.employee.gender === "F") {
    drawInBox(page, bold, "X", 215.6, 607.5, 13.2, 16, 11);
  }
  // 11 DOB
  drawP45DateBoxes(
    page,
    bold,
    opts.employee.dateOfBirth,
    { x: 116.5, y: 655.5, w: 27.3, h: 16 },
    { x: 154.8, y: 655.5, w: 27.3, h: 16 },
    { x: 193.1, y: 655.5, w: 55.7, h: 16 },
  );
  // 12 Address + postcode
  const addr = splitPostcode(opts.employee.address);
  let ay = 429.5;
  for (const line of addr.lines.slice(0, 3)) {
    drawInBox(page, font, line, 384.3, ay, 215.9, 14, 9);
    ay += 14;
  }
  if (addr.postcode) {
    drawInBox(page, bold, addr.postcode, 384.3, 499.5, 129.4, 16, 10);
  }
  // 13 Employer name/address + postcode + date
  const empAddr = splitPostcode(opts.employer.address);
  const empLines = [opts.employer.name, ...empAddr.lines].filter(Boolean).slice(0, 4);
  let ey = 568.4;
  for (const line of empLines) {
    drawInBox(page, font, line, 384.3, ey, 215.9, 14, 9);
    ey += 14;
  }
  if (empAddr.postcode) {
    drawInBox(page, bold, empAddr.postcode, 384.3, 655.5, 129.4, 16, 10);
  }
  drawP45DateBoxes(
    page,
    bold,
    opts.issuedAt,
    { x: 384.3, y: 691.5, w: 27.3, h: 16 },
    { x: 422.6, y: 691.5, w: 27.3, h: 16 },
    { x: 460.8, y: 691.5, w: 55.7, h: 16 },
  );
}

export async function renderP45Pdf(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  leaveDate: string;
  totals: YtdTotals;
  issuedAt?: string;
}) {
  const bytes = await loadTemplate("P45_Continuous_Clean.pdf");
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const issued = opts.issuedAt ?? new Date().toISOString().slice(0, 10);
  const core = {
    employer: opts.employer,
    employee: opts.employee,
    leaveDate: opts.leaveDate,
    totals: opts.totals,
  };
  const pages = doc.getPages();
  // Part 1, 1A, 2, 3 — all carry leaving boxes 1–7
  for (const page of pages) {
    fillP45LeavingCore(page, font, bold, core);
  }
  // Part 1 + Part 1A also carry boxes 8–13
  for (const page of [pages[0], pages[1]]) {
    if (!page) continue;
    fillP45LeavingExtended(page, font, bold, {
      employer: opts.employer,
      employee: opts.employee,
      totals: opts.totals,
      issuedAt: issued,
    });
  }
  return Buffer.from(await doc.save());
}

export async function renderPayslipPdf(opts: {
  employerName: string;
  payeRef?: string | null;
  employee: StatutoryEmployee;
  line: PayLine;
  periodLabel: string;
  payDate: string;
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width: W, height: H } = page.getSize();
  let y = H - 48;
  page.drawText("Payslip", { x: 48, y, size: 18, font: bold, color: ink });
  y -= 20;
  page.drawText(opts.employerName, { x: 48, y, size: 11, font: bold, color: ink });
  y -= 14;
  page.drawText(
    `${opts.employee.forename} ${opts.employee.surname} · ${opts.employee.payrollId}`,
    { x: 48, y, size: 10, font, color: ink },
  );
  y -= 14;
  page.drawText(`Period ${opts.periodLabel} · Pay date ${opts.payDate}`, {
    x: 48,
    y,
    size: 10,
    font,
    color: ink,
  });
  y -= 28;
  const rows: [string, string][] = [
    ["Gross pay", moneyParts(opts.line.grossPence).pounds + "." + moneyParts(opts.line.grossPence).pence],
    ["Income tax", moneyParts(opts.line.taxPence).pounds + "." + moneyParts(opts.line.taxPence).pence],
    [
      "Employee NI",
      moneyParts(opts.line.employeeNiPence).pounds +
        "." +
        moneyParts(opts.line.employeeNiPence).pence,
    ],
    ["Net pay", moneyParts(opts.line.netPence).pounds + "." + moneyParts(opts.line.netPence).pence],
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: 48, y, size: 10, font, color: ink });
    page.drawText(`£ ${value}`, {
      x: W - 48 - font.widthOfTextAtSize(`£ ${value}`, 10),
      y,
      size: 10,
      font: bold,
      color: ink,
    });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}
