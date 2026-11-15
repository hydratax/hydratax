import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Sa100Draft } from "@/lib/sa100/schema";
import type { Sa302Result } from "@/lib/sa100/calculate";
import { parseAddressParts } from "@/lib/address-parts";

const SA100_TEMPLATE = "SA100-2026.pdf";

export type SaPdfMeta = {
  /** Shown on top after submit (IRmark / correlation / submission ref). */
  submissionRef?: string | null;
  status?: "draft" | "submitted" | "accepted";
  taxYear?: string;
  /** Printed into TR1 Issue address (street / city / postcode). */
  address?: string | null;
};

function money(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function poundsPence(n: number): { pounds: string; pence: string } {
  const v = Math.max(0, Math.round((n + Number.EPSILON) * 100));
  const pounds = String(Math.floor(v / 100));
  const pence = String(v % 100).padStart(2, "0");
  return { pounds, pence };
}

function resolveSa100TemplatePath(): string {
  const candidates = [
    path.join(process.cwd(), "public", "hmrc", SA100_TEMPLATE),
    path.join(process.cwd(), "hmrc", SA100_TEMPLATE),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  }
  throw new Error(
    `HMRC SA100 template PDF not found (expected ${SA100_TEMPLATE} in public/hmrc).`,
  );
}

/** SA100 2026 money grid pitch (PyMuPDF-measured). */
const MONEY_PITCH = 15.59;
/** Gap from last pound cell left → first pence cell left (decimal gap). */
const MONEY_PENCE_GAP = 22.68;
/** Left-column first pounds cell (after £). */
const MONEY_L = 81.54;
/** Right-column first pounds cell (after £). */
const MONEY_R = 340.41;
/** DD MM YYYY cell left edges (gaps after day + month). */
const DATE_CELL_XS = [
  65.95, 81.54, 104.21, 119.81, 142.48, 158.07, 173.66, 189.25,
];
const DATE_CELL_W = 15.59;

/**
 * Write pounds into the SA100 money grid — one glyph per cell, right-aligned.
 * `firstDigitX` = left edge of the first pounds digit box (not the £).
 * Full grids: 8 pound cells; pence “00” are pre-printed — only overwrite when non-zero.
 * `boxBottom` = pdf-lib y of the white cell bottom edge.
 */
function drawMoney(
  page: PDFPage,
  font: PDFFont,
  firstDigitX: number,
  boxBottom: number,
  amount: number,
  poundSlots = 8,
) {
  if (!amount) return;
  const { pounds, pence } = poundsPence(amount);
  // Centre in measured cell width (~pitch); 13pt left-shifted vs stationery.
  const cell = MONEY_PITCH;
  const size = 9;
  // Match pre-printed £ / 00 baseline inside the white cell.
  const y = boxBottom + 5.2;
  const digits = pounds.slice(-poundSlots);
  const startSlot = poundSlots - digits.length;
  for (let i = 0; i < digits.length; i++) {
    const ch = digits[i]!;
    const cellLeft = firstDigitX + (startSlot + i) * MONEY_PITCH;
    const glyphW = font.widthOfTextAtSize(ch, size);
    page.drawText(ch, {
      x: cellLeft + (cell - glyphW) / 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
  // Stationery already prints “00”; only draw when pence are non-zero.
  if (pence !== "00") {
    const penceX0 =
      firstDigitX + (poundSlots - 1) * MONEY_PITCH + MONEY_PENCE_GAP;
    for (let i = 0; i < 2; i++) {
      const ch = pence[i]!;
      const cellLeft = penceX0 + i * MONEY_PITCH;
      const glyphW = font.widthOfTextAtSize(ch, size);
      page.drawText(ch, {
        x: cellLeft + (cell - glyphW) / 2,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }
}

/** Centre an X inside an HMRC checkbox (~13×13 pt white square). */
function drawX(page: PDFPage, font: PDFFont, boxLeft: number, boxBottom: number) {
  const size = 9;
  const box = 13;
  const glyphW = font.widthOfTextAtSize("X", size);
  page.drawText("X", {
    x: boxLeft + (box - glyphW) / 2,
    // PDF y is glyph baseline — lift so the X sits visually centred.
    y: boxBottom + (box - size) / 2 + 1.5,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

/** Centre a short digit string in an HMRC “Number” box (~13×13). */
function drawCountBox(
  page: PDFPage,
  font: PDFFont,
  boxLeft: number,
  boxBottom: number,
  text: string,
) {
  const size = 10;
  const box = 13;
  const t = text.slice(0, 2);
  const glyphW = font.widthOfTextAtSize(t, size);
  page.drawText(t, {
    x: boxLeft + (box - glyphW) / 2,
    y: boxBottom + (box - size) / 2 + 1.5,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawLine(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  text: string,
  size = 9,
) {
  if (!text) return;
  page.drawText(text.slice(0, 60), {
    x,
    y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

/**
 * Write digits into HMRC DD MM YYYY boxes.
 * Prefer explicit per-cell left edges (gaps after DD and MM); else even pitch.
 */
function drawDateBoxes(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  isoOrDigits: string,
  pitchOrXs: number | number[] = 15.6,
) {
  const m = isoOrDigits.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const digits = m
    ? `${m[3]}${m[2]}${m[1]}`
    : isoOrDigits.replace(/\D/g, "").slice(0, 8);
  if (!digits) return;
  const size = 10;
  for (let i = 0; i < digits.length; i++) {
    const ch = digits[i]!;
    const cellLeft = Array.isArray(pitchOrXs)
      ? (pitchOrXs[i] ?? pitchOrXs[pitchOrXs.length - 1] ?? x)
      : x + i * pitchOrXs;
    const glyphW = font.widthOfTextAtSize(ch, size);
    page.drawText(ch, {
      x: cellLeft + (DATE_CELL_W - glyphW) / 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

/** One glyph per HMRC cell using absolute left edges. */
function drawDigitCells(
  page: PDFPage,
  font: PDFFont,
  cellLefts: number[],
  y: number,
  raw: string,
  size = 9,
) {
  const chars = raw.replace(/\s/g, "").slice(0, cellLefts.length);
  if (!chars) return;
  const cell = 13;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const glyphW = font.widthOfTextAtSize(ch, size);
    const left = cellLefts[i]!;
    page.drawText(ch, {
      x: left + (cell - glyphW) / 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

function bannerSubmission(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  meta: SaPdfMeta,
  width: number,
) {
  const ref = meta.submissionRef?.trim();
  if (!ref) return;
  page.drawRectangle({
    x: 36,
    y: 808,
    width: width - 72,
    height: 22,
    color: rgb(0.94, 0.98, 0.97),
    borderColor: rgb(0.06, 0.46, 0.43),
    borderWidth: 0.8,
  });
  page.drawText(`Submission number: ${ref}`, {
    x: 44,
    y: 815,
    size: 10,
    font: bold,
    color: rgb(0.06, 0.35, 0.32),
  });
  if (meta.status) {
    page.drawText(meta.status.toUpperCase(), {
      x: width - 120,
      y: 815,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
}

/** Official SA100 2026 stationery with answers filled in. */
export async function buildSa100Pdf(
  draft: Sa100Draft,
  clientName: string,
  meta: SaPdfMeta = {},
): Promise<Uint8Array> {
  const templateBytes = fs.readFileSync(
    /* turbopackIgnore: true */ resolveSa100TemplatePath(),
  );
  const src = await PDFDocument.load(templateBytes);
  // Keep TR1–TR8 only — drop HMRC cover / info sheets so the company
  // name never lands in the cover "Issue address" box.
  const doc = await PDFDocument.create();
  const trPages = await doc.copyPages(src, [2, 3, 4, 5, 6, 7, 8, 9]);
  for (const page of trPages) doc.addPage(page);

  // Helvetica for digits — clearer in HMRC money / date boxes than Courier.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  // Indices: 0=TR1 … 7=TR8 — official stationery only, no extra pages.
  for (const page of pages) {
    bannerSubmission(page, font, bold, meta, page.getSize().width);
  }

  // TR1 — calibrated on SA100-2026 (never invent employer ref).
  const tr1 = pages[0];
  if (tr1) {
    if (draft.utr) drawLine(tr1, font, 80, 735, draft.utr.replace(/\s/g, ""), 9);
    if (draft.nino) drawLine(tr1, font, 80, 721, draft.nino.replace(/\s/g, "").toUpperCase(), 9);
    // Front “Date” (prep / declaration) — DD/MM/YYYY.
    const frontDate =
      draft.declarationDate?.trim() ||
      new Date().toISOString().slice(0, 10);
    {
      const m = frontDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const face = m ? `${m[3]}/${m[2]}/${m[1]}` : frontDate.slice(0, 10);
      drawLine(tr1, font, 80, 690, face, 9);
    }
    // Issue address — name + address lines (matches filed SA100 sample).
    const issueX = 320;
    let issueY = 700;
    if (clientName) {
      drawLine(tr1, font, issueX, issueY, clientName, 9);
      issueY -= 15;
    }
    const rawAddr = (meta.address || draft.addressCorrection || "").trim();
    let addrLines: string[] = [];
    if (rawAddr) {
      const p = parseAddressParts(rawAddr);
      if (p.street || p.city || p.postcode) {
        addrLines = [p.street, p.city, p.country, p.postcode].filter(Boolean);
      } else {
        addrLines = rawAddr
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    for (const line of addrLines.slice(0, 5)) {
      drawLine(tr1, font, issueX, issueY, line, 9);
      issueY -= 15;
    }
    if (meta.submissionRef) {
      drawLine(tr1, font, 340, 533, meta.submissionRef, 8);
    }
    // Box 1 DOB — DD MM YYYY cells with gaps after day / month.
    if (draft.dateOfBirth) {
      drawDateBoxes(tr1, font, DATE_CELL_XS[0]!, 138.4, draft.dateOfBirth, DATE_CELL_XS);
    }
    // Box 3 phone — digit cells (leave box 4 NINO blank when top NINO is correct).
    if (draft.phone) {
      drawDigitCells(
        tr1,
        font,
        [
          325.2, 340.8, 356.4, 372.0, 387.6, 403.0, 418.6, 434.2, 449.8, 465.4,
          481.0, 496.6, 512.2, 527.8, 543.4,
        ],
        152,
        draft.phone.replace(/\D/g, ""),
        9,
      );
    }
  }

  // TR2 — what makes up the return
  // Checkbox coords = bottom-left of each white tick box (calibrated on SA100 2026).
  const tr2 = pages[1];
  if (tr2) {
    const L_YES = 90;
    const L_NO = 141;
    const L_NUM = 211;
    const R_YES = 349;
    const R_NO = 400;
    const mark = (yes: boolean, yesX: number, noX: number, y: number) => {
      drawX(tr2, bold, yes ? yesX : noX, y);
    };
    mark(draft.hasEmployment, L_YES, L_NO, 618.9);
    if (draft.hasEmployment) {
      drawCountBox(
        tr2,
        font,
        L_NUM,
        618.9,
        String(draft.employmentCount || draft.employments.length || 1),
      );
    }
    mark(draft.hasSelfEmployment, L_YES, L_NO, 462.9);
    if (draft.hasSelfEmployment) {
      drawCountBox(
        tr2,
        font,
        L_NUM,
        462.9,
        String(draft.selfEmploymentCount || 1),
      );
    }
    mark(draft.hasPartnership, L_YES, L_NO, 386.9);
    if (draft.hasPartnership) {
      drawCountBox(
        tr2,
        font,
        L_NUM,
        386.9,
        String(draft.partnershipCount || 1),
      );
    }
    mark(draft.hasUkProperty, L_YES, L_NO, 287.4);
    mark(draft.hasForeign, L_YES, L_NO, 136.4);
    mark(draft.hasTrusts, L_YES, L_NO, 39.9);
    mark(draft.hasCapitalGains, R_YES, R_NO, 624.4);
    mark(draft.hasResidenceFig, R_YES, R_NO, 366.4);
    mark(draft.hasAdditionalInfoPages, R_YES, R_NO, 251.9);
  }

  // TR3 — income (boxBottom calibrated on SA100-2026; short grids use fewer pound slots)
  const tr3 = pages[2];
  if (tr3) {
    drawMoney(tr3, font, MONEY_L, 689.38, draft.interestTaxedUk);
    drawMoney(tr3, font, MONEY_L, 632.38, draft.interestUntaxedUk);
    drawMoney(tr3, font, MONEY_L, 575.38, draft.interestUntaxedForeign, 4);
    drawMoney(tr3, font, MONEY_L, 517.38, draft.dividendsUk);
    drawMoney(tr3, font, MONEY_R, 701.38, draft.dividendsOther);
    drawMoney(tr3, font, MONEY_R, 632.38, draft.dividendsForeign, 4);
    drawMoney(tr3, font, MONEY_R, 587.38, draft.dividendsForeignTax, 4);
    drawMoney(tr3, font, MONEY_L, 429.38, draft.statePension, 5);
    drawMoney(tr3, font, MONEY_L, 372.38, draft.statePensionLumpSum, 5);
    drawMoney(tr3, font, MONEY_L, 327.38, draft.statePensionLumpSumTax, 5);
    drawMoney(tr3, font, MONEY_L, 258.38, draft.otherPensions);
    drawMoney(tr3, font, MONEY_R, 441.38, draft.otherPensionsTax);
    drawMoney(tr3, font, MONEY_R, 384.38, draft.incapacityEsa, 5);
    drawMoney(tr3, font, MONEY_R, 340.38, draft.incapacityTax, 5);
    drawMoney(tr3, font, MONEY_R, 295.38, draft.jobseekersAllowance, 5);
    drawMoney(tr3, font, MONEY_R, 250.38, draft.otherStateBenefits, 5);
    drawMoney(tr3, font, MONEY_L, 133.38, draft.otherTaxableIncome);
    drawMoney(tr3, font, MONEY_L, 88.38, draft.otherIncomeExpenses);
    drawMoney(tr3, font, MONEY_L, 48.6, draft.otherIncomeTax);
    drawMoney(tr3, font, MONEY_R, 145.38, draft.preOwnedAssets);
  }

  // TR4 — reliefs
  const tr4 = pages[3];
  if (tr4) {
    drawMoney(tr4, font, MONEY_L, 623.38, draft.pensionReliefAtSource);
    drawMoney(tr4, font, MONEY_L, 579.38, draft.pensionOneOff);
    drawMoney(tr4, font, MONEY_L, 516.38, draft.retirementAnnuity);
    drawMoney(tr4, font, MONEY_R, 636.38, draft.employerPensionNotDeducted);
    drawMoney(tr4, font, MONEY_R, 561.38, draft.overseasPension);
    drawMoney(tr4, font, MONEY_L, 435.38, draft.giftAid);
    drawMoney(tr4, font, MONEY_L, 385.38, draft.giftAidOneOff);
    drawMoney(tr4, font, MONEY_L, 323.38, draft.giftAidCarryBack);
    drawMoney(tr4, font, MONEY_R, 423.38, draft.giftAidTreatAsThisYear);
    drawMoney(tr4, font, MONEY_R, 373.38, draft.sharesToCharity);
    drawMoney(tr4, font, MONEY_R, 323.38, draft.landToCharity);
  }

  // TR5 — student loan / HICBC
  const tr5 = pages[4];
  if (tr5) {
    if (draft.studentLoanNotification || draft.studentLoanPlan !== "none") {
      drawX(tr5, bold, 72, 720);
    }
    drawMoney(tr5, font, MONEY_R, 702.38, draft.studentLoanDeducted);
    drawMoney(tr5, font, MONEY_R, 646.38, draft.postgraduateLoanDeducted);
    drawMoney(tr5, font, MONEY_L, 489.38, draft.childBenefitAmount, 5);
  }

  // TR6 — finishing (tax refunded)
  const tr6 = pages[5];
  if (tr6) {
    drawMoney(tr6, font, MONEY_L, 601.38, draft.taxRefunded);
  }

  // TR7 — adviser + any other information
  const tr7 = pages[6];
  if (tr7) {
    if (draft.adviserName) drawLine(tr7, font, 70, 700, draft.adviserName, 9);
    if (draft.adviserPhone) drawLine(tr7, font, 70, 650, draft.adviserPhone, 9);
    if (draft.adviserAddress) {
      const lines = draft.adviserAddress.split(/\n|, /).filter(Boolean);
      lines.slice(0, 3).forEach((ln, i) => {
        drawLine(tr7, font, 70, 600 - i * 18, ln, 9);
      });
    }
    if (draft.adviserRef) drawLine(tr7, font, 70, 520, draft.adviserRef, 9);
    if (draft.anyOtherInformation) {
      const words = draft.anyOtherInformation.replace(/\s+/g, " ").trim();
      const chunks: string[] = [];
      let rest = words;
      while (rest && chunks.length < 12) {
        chunks.push(rest.slice(0, 85));
        rest = rest.slice(85);
      }
      chunks.forEach((ln, i) => {
        drawLine(tr7, font, 55, 380 - i * 12, ln, 8);
      });
    }
  }

  // TR8 — boxes 20/21 tick boxes (calibrated), declaration date + name, 23–25.
  const tr8 = pages[7];
  if (tr8) {
    // Checkbox bottom-left — NOT the printed “put 'X'” wording.
    if (draft.provisionalFigures) drawX(tr8, bold, 66.5, 681.9);
    if (draft.enclosingSupplementary) drawX(tr8, bold, 66.5, 619.4);
    const declName =
      draft.declarationName.trim() || clientName.trim() || "";
    if (declName) drawLine(tr8, font, 70, 480, declName.slice(0, 40), 9);
    const declDate =
      draft.declarationDate.trim() ||
      new Date().toISOString().slice(0, 10);
    // Same DD MM YYYY cell Xs as TR1 DOB (pitch 13.5 was too narrow → left drift).
    drawDateBoxes(tr8, font, DATE_CELL_XS[0]!, 416.6, declDate, DATE_CELL_XS);
    if (draft.signedCapacity) {
      drawLine(tr8, font, 320, 700, draft.signedCapacity.slice(0, 40), 9);
    }
    if (draft.signedForName) {
      drawLine(tr8, font, 320, 640, draft.signedForName.slice(0, 40), 9);
    }
    if (draft.signedCapacity || draft.signedForName) {
      drawLine(tr8, font, 320, 580, declName.slice(0, 40), 9);
    }
  }

  return doc.save();
}

/**
 * SA302 — layout matched to accountant sample:
 * red IRmark only if submitted; three grey client chips; mid + right
 * amount columns; rate rows as “£x × r% = £tax”; grey total bars; PoA block.
 */
export async function buildSa302Pdf(
  calc: Sa302Result,
  clientName: string,
  utr: string,
  meta: SaPdfMeta = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 48;
  const left = margin;
  const mid = 410; // line-item / band amounts (sample middle column)
  const right = width - margin; // running totals / tax charged
  const grey = rgb(0.88, 0.88, 0.88);
  const black = rgb(0, 0, 0);
  const red = rgb(0.82, 0.05, 0.05);
  const size = 9;
  const rowGap = 15;
  const sectionGap = 22;
  let y = height - 40;

  const incomeTaxDue =
    Math.round((calc.incomeTax - calc.taxDeducted) * 100) / 100;
  const balancing = calc.amountDue;
  const poa = calc.paymentsOnAccountEach;
  const taxYearLabel = meta.taxYear || calc.taxYear;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts?: {
      bold?: boolean;
      size?: number;
      center?: boolean;
      color?: ReturnType<typeof rgb>;
    },
  ) => {
    const f = opts?.bold ? bold : font;
    const sz = opts?.size ?? size;
    let dx = x;
    if (opts?.center) {
      dx = (width - f.widthOfTextAtSize(s, sz)) / 2;
    }
    page.drawText(s, {
      x: dx,
      y: yy,
      size: sz,
      font: f,
      color: opts?.color ?? black,
    });
  };

  const amt = (n: number, xRight: number, yy: number, useBold = false) => {
    const f = useBold ? bold : font;
    const s = money(n);
    page.drawText(s, {
      x: xRight - f.widthOfTextAtSize(s, size),
      y: yy,
      size,
      font: f,
      color: black,
    });
  };

  const bar = (yy: number, h = 16) => {
    page.drawRectangle({
      x: left,
      y: yy - 4,
      width: width - margin * 2,
      height: h,
      color: grey,
    });
  };

  const hairline = (yy: number) => {
    page.drawLine({
      start: { x: left, y: yy },
      end: { x: right, y: yy },
      thickness: 0.4,
      color: rgb(0.7, 0.7, 0.7),
    });
  };

  // Red IRmark — only when submitted (sample shows it after filing).
  const submitted =
    meta.status === "submitted" || meta.status === "accepted";
  const ref = meta.submissionRef?.trim();
  if (submitted && ref) {
    text(`HMRC IRmark: ${ref}`, 0, y, {
      size: 9,
      center: true,
      color: red,
    });
    y -= 22;
  } else {
    y -= 6;
  }

  text("Tax Calculation (SA302)", 0, y, { bold: true, size: 12, center: true });
  y -= 26;

  // Header chips: label + value inside one grey bar.
  const chip = (label: string, value: string, x: number, w: number) => {
    page.drawRectangle({
      x,
      y: y - 4,
      width: w,
      height: 18,
      color: grey,
    });
    text(`${label} ${value || "—"}`, x + 6, y + 1, { bold: true, size: 9 });
  };
  chip("Client Name:", clientName || "—", left, 210);
  chip("UTR No.:", utr || "—", left + 220, 140);
  chip("Tax Year:", taxYearLabel, left + 370, width - margin - (left + 370));
  y -= 30;

  // —— Income received ——
  bar(y);
  text("Income received (before tax taken off)", left + 4, y, { bold: true });
  y -= 18;

  const incomeLines: { label: string; amount: number }[] = [];
  if (calc.employmentIncome)
    incomeLines.push({
      label: "Pay from all employments",
      amount: calc.employmentIncome,
    });
  if (calc.selfEmploymentProfit)
    incomeLines.push({
      label: "Profit from self-employment",
      amount: calc.selfEmploymentProfit,
    });
  if (calc.propertyProfit)
    incomeLines.push({
      label: "Income from UK property",
      amount: calc.propertyProfit,
    });
  if (calc.savingsIncome)
    incomeLines.push({
      label: "Interest from UK banks etc.",
      amount: calc.savingsIncome,
    });
  if (calc.dividendIncome)
    incomeLines.push({
      label: "Dividends from UK companies",
      amount: calc.dividendIncome,
    });
  if (calc.pensionIncome)
    incomeLines.push({
      label: "UK pensions and state benefits",
      amount: calc.pensionIncome,
    });
  if (calc.otherIncome)
    incomeLines.push({ label: "Other income", amount: calc.otherIncome });

  for (const line of incomeLines) {
    text(line.label, left, y);
    amt(line.amount, mid, y);
    y -= rowGap;
  }
  text("Total income received", left, y, { bold: true });
  amt(calc.totalIncome, right, y, true);
  y -= rowGap;
  text("minus Personal Allowance", left, y);
  amt(calc.personalAllowance, mid, y);
  y -= rowGap + 2;
  bar(y);
  text("Total income on which tax is due", left + 4, y, { bold: true });
  amt(calc.taxableIncome, right - 4, y, true);
  y -= sectionGap;

  // —— How tax worked out ——
  text("How I have worked out your Income Tax", left, y, { bold: true });
  y -= 16;

  // Sample: "Basic rate" … "£657.00 x 20% =" … "£131.40"
  const bandRight = 335;
  const eqX = 344;
  const rateRow = (
    label: string,
    band: number,
    ratePct: string,
    tax: number,
  ) => {
    text(label, left + 16, y);
    amt(band, bandRight, y);
    text(`x ${ratePct} =`, eqX, y);
    amt(tax, right, y);
    y -= rowGap;
  };

  let wroteNs = false;
  let wroteSav = false;
  let wroteDiv = false;
  for (const line of calc.breakdown) {
    const m = line.label.match(
      /^(.*?)\s+(\d+(?:\.\d+)?)%\s+(?:\([^)]+\)\s+)?on\s+£([\d,.]+)/i,
    );
    const allowance =
      /allowance|Personal Savings|Dividend allowance|Starting rate/i.test(
        line.label,
      );
    const isDiv = /dividend/i.test(line.label);
    const isSav = /savings|Starting rate/i.test(line.label);
    const isNs =
      !isDiv &&
      !isSav &&
      !allowance &&
      !/relief|finance/i.test(line.label);

    if (isNs && !wroteNs) {
      text(
        "Pay, pensions, profit etc. (UK rate for England and Northern Ireland)",
        left + 8,
        y,
        { size: 8 },
      );
      y -= rowGap;
      wroteNs = true;
    }
    if (isSav && !wroteSav && !isDiv) {
      text("Savings interest etc.", left + 8, y, { size: 8 });
      y -= rowGap;
      wroteSav = true;
    }
    if (isDiv && !wroteDiv) {
      text("Dividends from companies etc.", left + 8, y, { size: 8 });
      y -= rowGap;
      wroteDiv = true;
    }

    if (m) {
      const rawLabel = m[1]!.trim();
      const rate = m[2]!;
      const band = Number(m[3]!.replace(/,/g, ""));
      let face = "Basic rate";
      if (/higher/i.test(rawLabel)) face = "Higher rate";
      else if (/additional/i.test(rawLabel)) face = "Additional rate";
      else if (
        Number(rate) === 0 ||
        /nil|allowance|Starting/i.test(rawLabel)
      ) {
        face = "Basic rate band at nil rate";
      }
      rateRow(face, band, `${rate}%`, line.amount);
    } else if (allowance) {
      const am = line.label.match(/£([\d,.]+)/);
      const band = am ? Number(am[1]!.replace(/,/g, "")) : 0;
      rateRow(
        /dividend/i.test(line.label)
          ? "Basic rate band at nil rate"
          : /Starting/i.test(line.label)
            ? "Starting rate for savings"
            : "Personal Savings Allowance",
        band,
        "0%",
        0,
      );
    } else if (/relief|finance/i.test(line.label)) {
      text(line.label, left + 16, y, { size: 8 });
      amt(line.amount, right, y);
      y -= rowGap;
    }
  }

  text("Total income on which tax has been charged", left, y, { bold: true });
  amt(calc.taxableIncome, right, y, true);
  y -= rowGap + 2;
  bar(y);
  text("Income Tax charged after allowances and reliefs", left + 4, y, {
    bold: true,
  });
  amt(calc.incomeTax, right - 4, y, true);
  y -= sectionGap - 4;

  text("minus Tax deducted", left, y);
  y -= rowGap;
  text("From all employments, UK pensions and state benefits", left + 16, y);
  amt(calc.taxDeducted, mid, y);
  y -= rowGap;
  text("Total tax deducted", left + 16, y, { bold: true });
  amt(calc.taxDeducted, right, y, true);
  y -= rowGap + 2;
  bar(y);
  text("Total Income Tax due", left + 4, y, { bold: true });
  amt(incomeTaxDue, right - 4, y, true);
  y -= rowGap + 2;

  if (calc.class4Nic) {
    text("Class 4 National Insurance contributions", left, y);
    amt(calc.class4Nic, right, y);
    y -= rowGap;
  }
  if (calc.studentLoan) {
    text("Student Loan repayment", left, y);
    amt(calc.studentLoan, right, y);
    y -= rowGap;
  }
  if (calc.hicbc) {
    text("High Income Child Benefit Charge", left, y);
    amt(calc.hicbc, right, y);
    y -= rowGap;
  }

  // —— Payment on account (sample page 2) ——
  y -= 8;
  bar(y);
  text("Payment on account due", left + 4, y, { bold: true });
  y -= 18;

  text("Total Income Tax Due", left, y, { bold: true });
  amt(balancing, mid, y, true);
  y -= rowGap;
  text("Decrease in tax due because of adjustment to earlier year", left, y);
  amt(0, mid, y);
  y -= rowGap;
  // Sample uses the *next* tax-year label for “repayment being claimed now”.
  const nextYearLabel = (() => {
    const start = Number(String(taxYearLabel).split("-")[0]);
    if (!Number.isFinite(start)) return taxYearLabel;
    const a = String(start + 1);
    const b = String(start + 2).slice(-2);
    return `${a}-${b}`;
  })();
  text(`${nextYearLabel} repayment being claimed now`, left, y);
  amt(0, mid, y);
  y -= rowGap;
  text("Payment on account already made in the year", left, y);
  amt(0, mid, y);
  y -= rowGap;
  text("Other payments made towards balancing payment", left, y);
  amt(0, mid, y);
  y -= rowGap;
  text("Amount to be collected via PAYE", left, y);
  amt(0, mid, y);
  hairline(y - 3);
  amt(balancing, right, y - 3, true);
  y -= rowGap + 2;
  text("Tax due", left, y, { bold: true });
  amt(balancing, right, y, true);

  const janYear = (() => {
    const start = Number(String(taxYearLabel).split("-")[0]);
    return Number.isFinite(start) ? start + 2 : new Date().getFullYear() + 1;
  })();
  y -= rowGap + 2;
  text(
    `Calculated Payment on Account due by 31st January ${janYear}`,
    left,
    y,
  );
  amt(poa, mid, y);
  hairline(y - 3);
  amt(poa, right, y - 3);
  y -= rowGap + 2;
  text(`Total payment due by 31st January ${janYear}`, left, y, {
    bold: true,
  });
  amt(balancing + poa, right, y, true);
  y -= rowGap + 2;
  text(`Total payment due by 31st July ${janYear}`, left, y, { bold: true });
  amt(poa, right, y, true);

  page.drawLine({
    start: { x: left, y: 46 },
    end: { x: right, y: 46 },
    thickness: 1,
    color: black,
  });
  text("1 of 1", 0, 30, { size: 9, center: true });

  return doc.save();
}
