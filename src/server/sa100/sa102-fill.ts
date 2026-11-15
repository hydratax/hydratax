import {
  StandardFonts,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { EmploymentRow } from "@/lib/sa100/schema";

function poundsPence(n: number): { pounds: string; pence: string } {
  const v = Math.max(0, Math.round((n + Number.EPSILON) * 100));
  return {
    pounds: String(Math.floor(v / 100)),
    pence: String(v % 100).padStart(2, "0"),
  };
}

const MONEY_PITCH = 15.59;
const MONEY_PENCE_GAP = 22.68;
/** Left of first pounds cell after £ — SA102-2026. */
const MX = 81.54;

/**
 * SA102 2026 money grid — one glyph per pound cell, right-aligned.
 * Pence “00” are pre-printed; only overwrite when non-zero.
 * `boxBottom` = pdf-lib y of the white cell bottom.
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
  const cell = MONEY_PITCH;
  const size = 9;
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

function drawX(
  page: PDFPage,
  font: PDFFont,
  boxLeft: number,
  boxBottom: number,
) {
  const size = 9;
  const box = 13;
  const glyphW = font.widthOfTextAtSize("X", size);
  page.drawText("X", {
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

/** PAYE ref cells — 3 before slash gap, then employer digits. */
const PAYE_CELL_XS = [
  65.95, 81.54, 97.13, 128.31, 143.9, 159.49, 175.08, 190.67, 206.26, 221.85,
  237.44, 253.03, 268.62,
];

function drawPayeRef(
  page: PDFPage,
  font: PDFFont,
  boxBottom: number,
  raw: string,
) {
  const cleaned = raw.replace(/\s/g, "").toUpperCase();
  if (!cleaned) return;
  const slash = cleaned.indexOf("/");
  let chars: string[];
  if (slash >= 0) {
    const left = cleaned.slice(0, slash).replace(/\D/g, "").slice(0, 3);
    const right = cleaned
      .slice(slash + 1)
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    chars = [...left.padStart(3, " ").slice(-3), ...right];
  } else {
    chars = cleaned.replace(/[^A-Z0-9]/g, "").slice(0, PAYE_CELL_XS.length).split("");
  }
  const cell = MONEY_PITCH;
  const size = 9;
  const y = boxBottom + 5.2;
  for (let i = 0; i < chars.length && i < PAYE_CELL_XS.length; i++) {
    const ch = chars[i]!;
    if (ch === " ") continue;
    const glyphW = font.widthOfTextAtSize(ch, size);
    const left = PAYE_CELL_XS[i]!;
    page.drawText(ch, {
      x: left + (cell - glyphW) / 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

/**
 * Overlay employment figures on official SA102-2026 page 1.
 * Money / PAYE / name Y = white-cell bottoms from PyMuPDF.
 */
export async function fillSa102EmploymentPage(
  doc: PDFDocument,
  page: PDFPage,
  emp: EmploymentRow,
  personName: string,
  utr: string,
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Header pink band — calibrated on SA102-2026 (name + 10 UTR cells, gap after 5th).
  const headerY = 716;
  if (personName) drawLine(page, font, 68, headerY, personName, 9);
  if (utr) {
    const digits = utr.replace(/\D/g, "").slice(0, 10);
    const utrXs = [
      325.2, 340.8, 356.4, 372.0, 387.6, 410.2, 425.8, 441.4, 457.0, 472.6,
    ];
    const cell = 13;
    for (let i = 0; i < digits.length; i++) {
      const ch = digits[i]!;
      const glyphW = font.widthOfTextAtSize(ch, 9);
      const left = utrXs[i] ?? utrXs[utrXs.length - 1]!;
      page.drawText(ch, {
        x: left + (cell - glyphW) / 2,
        y: headerY,
        size: 9,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  // Boxes 1 / 1.1 / 2 / 3 — cell bottoms measured on SA102-2026.
  drawMoney(page, font, MX, 619.94, emp.pay);
  drawMoney(page, font, MX, 571.35, emp.payrolledBenefitsStudentLoan);
  drawMoney(page, font, MX, 533.76, emp.taxTakenOff);
  drawMoney(page, font, MX, 496.17, emp.tips);

  // Box 4 — PAYE ref digit cells (not a free-text line above the grid).
  if (emp.payeRef) drawPayeRef(page, font, 458.58, emp.payeRef);

  // Box 5 — name inside the white field under the label (not on the label).
  if (emp.employerName) drawLine(page, font, 70, 424.5, emp.employerName, 9);

  // Box 6 / 7 / 8 — only mark when true (avoid stray Xs on No).
  if (emp.wasDirector) drawX(page, bold, 118, 395);
  if (emp.wasCloseCompany) drawX(page, bold, 118, 355);
  if (emp.offPayroll) drawX(page, bold, 118, 285);

  const cars = emp.benefitCars || 0;
  const goods = emp.benefitGoods || 0;
  if (cars) drawMoney(page, font, MX, 220, cars);
  if (goods) drawMoney(page, font, 340.41, 220, goods);
}
