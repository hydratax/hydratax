import {
  StandardFonts,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  seCapitalAllowancesBreakdownTotal,
  seExpensesBreakdownTotal,
  type Sa100Draft,
} from "@/lib/sa100/schema";
import { addressPartsDisplay } from "@/lib/address-parts";

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

/** SA103F 2026 money grid — same pitch as SA100/SA102 (PyMuPDF). */
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
  headerY: number,
) {
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

/** Expense boxes 17–30 white-cell bottoms (pdf-lib), SA103F page SEF 2. */
const EXPENSE_BOTTOMS = [
  669.2, // 17
  624.61, // 18
  580.02, // 19
  535.43, // 20
  490.85, // 21
  446.26, // 22
  401.67, // 23
  357.08, // 24
  312.49, // 25
  267.91, // 26
  223.32, // 27
  178.73, // 28
  134.15, // 29
  89.56, // 30
] as const;

/**
 * Overlay self-employment figures on official SA103F_2026.
 * When expense breakdown is empty, total goes in box 31 (HMRC short-cut).
 */
export async function fillSa103FPages(
  doc: PDFDocument,
  pages: PDFPage[],
  draft: Sa100Draft,
  personName: string,
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p0 = pages[0];
  const p1 = pages[1];
  const p2 = pages[2];
  const p4 = pages[4];
  const p5 = pages[5];
  if (!p0) return;

  // Name/UTR band sits lower than SA102 (labels ~y 141 from top).
  drawHeader(p0, font, personName, draft.utr || "", 676);

  if (draft.seBusinessName) drawLine(p0, font, 70, 582, draft.seBusinessName, 9);
  if (draft.seDescription) drawLine(p0, font, 70, 522, draft.seDescription, 9);
  if (draft.seBusinessAddress) {
    const line = addressPartsDisplay(draft.seBusinessAddress);
    if (line) drawLine(p0, font, 70, 449, line, 9);
  }

  if (draft.seCashBasis) drawX(p0, bold, 324.8, 288.9);

  // Boxes 15 / 16 / 16.1
  drawMoney(p0, font, MX, 72.59, draft.seTurnover);
  drawMoney(p0, font, MX_R, 85.09, draft.seOtherBusinessIncome);
  drawMoney(p0, font, MX_R, 41.38, draft.seTradingAllowance, 4);

  const broken = seExpensesBreakdownTotal(draft);
  const expenseTotal = broken > 0 ? broken : draft.seExpenses;
  const expenseLines = [
    draft.seCostOfGoods,
    draft.seCisSubcontractors,
    draft.seWages,
    draft.seCarVanTravel,
    draft.seRentPowerInsurance,
    draft.seRepairs,
    draft.sePhoneOffice,
    draft.seAdvertising,
    draft.seInterest,
    draft.seBankCharges,
    draft.seBadDebts,
    draft.seProfessionalFees,
    draft.seDepreciation,
    draft.seOtherExpensesDetail,
  ];

  if (p1) {
    if (broken > 0) {
      for (let i = 0; i < expenseLines.length; i++) {
        drawMoney(p1, font, MX, EXPENSE_BOTTOMS[i]!, expenseLines[i]!);
      }
    }
    drawMoney(p1, font, MX, 44.97, expenseTotal);
    drawMoney(p1, font, MX_R, 44.97, draft.seDisallowableTotal);
  }

  const income =
    draft.seTurnover +
    draft.seOtherBusinessIncome +
    draft.seBalancingCharges +
    draft.seGoodsOwnUse;
  const net = income - Math.max(0, expenseTotal - draft.seDisallowableTotal);
  const caBroken = seCapitalAllowancesBreakdownTotal(draft);
  const caTotal = caBroken > 0 ? caBroken : draft.seCapitalAllowances;
  const taxable = Math.max(0, net - caTotal - draft.seTradingAllowance);

  if (p2) {
    if (net >= 0) drawMoney(p2, font, MX, 721.32, net);
    else drawMoney(p2, font, MX_R, 708.82, Math.abs(net));

    // Capital allowances 49–56 → total 57 (measured on SEF 3).
    if (draft.seAia) drawMoney(p2, font, MX, 591.22, draft.seAia);
    if (draft.seElectricCharge) {
      drawMoney(p2, font, MX_R, 591.22, draft.seElectricCharge);
    }
    if (draft.seCa18) drawMoney(p2, font, MX, 538.73, draft.seCa18);
    if (draft.seEnhancedCa) {
      drawMoney(p2, font, MX_R, 546.63, draft.seEnhancedCa);
    }
    if (draft.seCa6) drawMoney(p2, font, MX, 486.24, draft.seCa6);
    if (draft.seDisposalAllowances) {
      drawMoney(p2, font, MX_R, 494.14, draft.seDisposalAllowances);
    }
    if (draft.seZeroEmissionGoods) {
      drawMoney(p2, font, MX, 441.65, draft.seZeroEmissionGoods);
    }
    if (draft.seZeroEmissionCar) {
      drawMoney(p2, font, MX, 397.07, draft.seZeroEmissionCar);
    }
    if (draft.seSba) drawMoney(p2, font, MX, 352.48, draft.seSba);
    drawMoney(p2, font, MX_R, 449.55, caTotal);
    // Box 64 taxable profit
    if (taxable > 0) drawMoney(p2, font, MX_R, 120.75, taxable);
  }

  if (p4) {
    const cis = draft.seCisDeductions || 0;
    const taxOff = draft.seTaxTakenOff || 0;
    if (cis) {
      drawMoney(p4, font, MX, 706.99, cis);
      if (taxOff > cis) drawMoney(p4, font, MX_R, 731.99, taxOff - cis);
    } else if (taxOff) {
      // Income-desk CIS often lands only in seTaxTakenOff — use box 82.
      drawMoney(p4, font, MX_R, 731.99, taxOff);
    }
  }

  if (p5 && draft.seClass4Exempt) {
    drawX(p5, bold, 65.95, 622.46);
  }
  if (p5 && draft.seAnyOtherInformation) {
    drawLine(p5, font, 50, 560, draft.seAnyOtherInformation.slice(0, 90), 8);
  }
}
