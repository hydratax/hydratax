import {
  StandardFonts,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  propCapitalAllowancesTotal,
  propExpensesBreakdownTotal,
  type Sa100Draft,
} from "@/lib/sa100/schema";

function poundsPence(n: number): { pounds: string; pence: string } {
  const v = Math.max(0, Math.round((n + Number.EPSILON) * 100));
  return {
    pounds: String(Math.floor(v / 100)),
    pence: String(v % 100).padStart(2, "0"),
  };
}

const MONEY_PITCH = 15.59;
const MONEY_PENCE_GAP = 22.68;
const MX = 81.54;
const MX_R = 340.41;

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

const UTR_XS = [
  325.2, 340.8, 356.4, 372.0, 387.6, 410.2, 425.8, 441.4, 457.0, 472.6,
];

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  personName: string,
  utr: string,
) {
  const headerY = 716;
  if (personName) drawLine(page, font, 68, headerY, personName, 9);
  if (!utr) return;
  const digits = utr.replace(/\D/g, "").slice(0, 10);
  const cell = 13;
  for (let i = 0; i < digits.length; i++) {
    const ch = digits[i]!;
    const glyphW = font.widthOfTextAtSize(ch, 9);
    const left = UTR_XS[i] ?? UTR_XS[UTR_XS.length - 1]!;
    page.drawText(ch, {
      x: left + (cell - glyphW) / 2,
      y: headerY,
      size: 9,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

const PROP_COUNT_XS = [250.5, 267.0];

function drawPropertyCount(
  page: PDFPage,
  font: PDFFont,
  boxBottom: number,
  count: number,
) {
  if (!count) return;
  const digits = String(Math.min(99, Math.max(0, Math.floor(count)))).padStart(
    2,
    " ",
  );
  const cell = 13;
  const size = 9;
  const y = boxBottom + 5.2;
  for (let i = 0; i < 2; i++) {
    const ch = digits[i]!;
    if (ch === " ") continue;
    const glyphW = font.widthOfTextAtSize(ch, size);
    const left = PROP_COUNT_XS[i]!;
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
 * Overlay UK property figures on official SA105_2026.
 * Legacy single expense total → box 29 when breakdown empty.
 */
export async function fillSa105Pages(
  doc: PDFDocument,
  pages: PDFPage[],
  draft: Sa100Draft,
  personName: string,
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p0 = pages[0];
  const p1 = pages[1];
  if (!p0) return;

  drawHeader(p0, font, personName, draft.utr || "");

  const count = draft.propPropertyCount || (draft.propRents > 0 ? 1 : 0);
  drawPropertyCount(p0, font, 615.29, count);

  if (draft.propJointLet) drawX(p0, bold, 517.6, 615.3);
  if (draft.propRentARoom) drawX(p0, bold, 517.6, 572.1);

  drawMoney(p0, font, MX, 426.23, draft.propRents);
  drawMoney(p0, font, MX, 383.56, draft.propIncomeAllowance, 4);
  drawMoney(p0, font, MX_R, 426.23, draft.propTaxTakenOff);
  drawMoney(p0, font, MX_R, 371.56, draft.propLeasePremiums);
  drawMoney(p0, font, MX_R, 328.89, draft.propReversePremiums);

  if (draft.propTraditionalAccounting) {
    drawX(p0, bold, 266.36, 341.39);
  }

  const broken = propExpensesBreakdownTotal(draft);
  const expenseTotal = broken > 0 ? broken : draft.propExpenses;

  if (broken > 0) {
    drawMoney(p0, font, MX, 250.28, draft.propRentRatesInsurance);
    drawMoney(p0, font, MX, 207.61, draft.propRepairs);
    drawMoney(p0, font, MX, 164.94, draft.propNonResFinance);
    drawMoney(p0, font, MX_R, 250.28, draft.propLegalFees);
    drawMoney(p0, font, MX_R, 207.61, draft.propServices);
    drawMoney(p0, font, MX_R, 164.94, draft.propOtherExpensesDetail);
  } else if (expenseTotal) {
    drawMoney(p0, font, MX_R, 164.94, expenseTotal);
  }

  if (!p1) return;

  const ca = propCapitalAllowancesTotal(draft);
  if (draft.propAia) drawMoney(p1, font, MX, 645.2, draft.propAia);
  if (draft.propSba) drawMoney(p1, font, MX, 602.53, draft.propSba);
  if (draft.propElectricCharge) {
    drawMoney(p1, font, MX, 559.86, draft.propElectricCharge);
  }
  if (draft.propZeroEmissionCar) {
    drawMoney(p1, font, MX, 419.85, draft.propZeroEmissionCar);
  }
  if (draft.propOtherCapitalAllowances) {
    drawMoney(p1, font, MX, 377.18, draft.propOtherCapitalAllowances);
  } else if (
    ca &&
    !draft.propAia &&
    !draft.propSba &&
    !draft.propElectricCharge &&
    !draft.propZeroEmissionCar &&
    !draft.propReplaceDomesticItems
  ) {
    // Legacy single CA total → box 35.
    drawMoney(p1, font, MX, 377.18, ca);
  }

  drawMoney(p1, font, MX, 322.51, draft.propReplaceDomesticItems);
  drawMoney(p1, font, MX_R, 730.54, draft.propRentARoomExempt, 4);
  drawMoney(p1, font, MX_R, 383.85, draft.propFinanceCosts);
  drawMoney(p1, font, MX_R, 329.18, draft.propFinanceCostsBroughtForward);

  const propIncome =
    draft.propRents +
    draft.propOtherIncome +
    draft.propLeasePremiums +
    draft.propReversePremiums +
    draft.propBalancingCharges;
  const adjusted = Math.max(
    0,
    propIncome -
      draft.propIncomeAllowance -
      expenseTotal -
      draft.propPrivateUse -
      ca -
      draft.propRentARoomExempt,
  );

  // Boxes 38 / 40
  drawMoney(p1, font, MX_R, 675.87, adjusted);
  drawMoney(p1, font, MX_R, 590.53, adjusted);
}
