import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Sa100Draft } from "@/lib/sa100/schema";
import type { Sa302Result } from "@/lib/sa100/calculate";

const SA100_TEMPLATE = "SA100-2026.pdf";

export type SaPdfMeta = {
  /** Shown on top after submit (IRmark / correlation / submission ref). */
  submissionRef?: string | null;
  status?: "draft" | "submitted" | "accepted";
  taxYear?: string;
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

function drawMoney(
  page: PDFPage,
  font: PDFFont,
  xPound: number,
  y: number,
  amount: number,
) {
  if (!amount) return;
  const { pounds, pence } = poundsPence(amount);
  // Amount sits in the money grid to the right of the £ glyph.
  page.drawText(pounds, {
    x: xPound + 18,
    y: y + 1,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(pence, {
    x: xPound + 118,
    y: y + 1,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawX(page: PDFPage, font: PDFFont, x: number, y: number) {
  page.drawText("X", {
    x,
    y,
    size: 10,
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

/** Write digits into HMRC DD MM YYYY style boxes. */
function drawDateBoxes(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  isoOrDigits: string,
  pitch = 12,
) {
  const m = isoOrDigits.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const digits = m
    ? `${m[3]}${m[2]}${m[1]}`
    : isoOrDigits.replace(/\D/g, "").slice(0, 8);
  if (!digits) return;
  for (let i = 0; i < digits.length; i++) {
    page.drawText(digits[i]!, {
      x: x + i * pitch,
      y,
      size: 10,
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
  void clientName;
  const pages = doc.getPages();
  // Indices: 0=TR1 … 7=TR8 — official stationery only, no extra pages.
  for (const page of pages) {
    bannerSubmission(page, font, bold, meta, page.getSize().width);
  }

  // TR1 — only fields that belong on this page (never invent employer ref / company name).
  const tr1 = pages[0];
  if (tr1) {
    if (draft.utr) drawLine(tr1, font, 78, 733, draft.utr, 9);
    if (draft.nino) drawLine(tr1, font, 78, 721, draft.nino, 9);
    if (meta.submissionRef) {
      drawLine(tr1, font, 340, 533, meta.submissionRef, 8);
    }
    if (draft.dateOfBirth) {
      drawDateBoxes(tr1, font, 66, 145, draft.dateOfBirth, 11);
    }
    if (draft.phone) drawLine(tr1, font, 330, 145, draft.phone, 9);
  }

  // TR2 — what makes up the return
  const tr2 = pages[1];
  if (tr2) {
    const mark = (yes: boolean, yesX: number, noX: number, y: number) => {
      drawX(tr2, bold, yes ? yesX : noX, y);
    };
    mark(draft.hasEmployment, 72, 126, 617);
    if (draft.hasEmployment && draft.employmentCount) {
      drawLine(tr2, font, 210, 617, String(draft.employmentCount || draft.employments.length || 1));
    }
    mark(draft.hasSelfEmployment, 72, 126, 461);
    if (draft.hasSelfEmployment && draft.selfEmploymentCount) {
      drawLine(tr2, font, 210, 461, String(draft.selfEmploymentCount || 1));
    }
    mark(draft.hasPartnership, 72, 126, 385);
    mark(draft.hasUkProperty, 72, 126, 285);
    mark(draft.hasForeign, 72, 126, 134);
    mark(draft.hasTrusts, 72, 126, 38);
    mark(draft.hasCapitalGains, 332, 386, 622);
    mark(draft.hasResidenceFig, 332, 386, 364);
    mark(draft.hasAdditionalInfoPages, 332, 386, 250);
  }

  // TR3 — income
  const tr3 = pages[2];
  if (tr3) {
    drawMoney(tr3, font, 69.7, 693.5, draft.interestTaxedUk);
    drawMoney(tr3, font, 69.7, 636.5, draft.interestUntaxedUk);
    drawMoney(tr3, font, 69.7, 579.4, draft.interestUntaxedForeign);
    drawMoney(tr3, font, 69.7, 522.3, draft.dividendsUk);
    drawMoney(tr3, font, 328.5, 706, draft.dividendsOther);
    drawMoney(tr3, font, 328.5, 636.5, draft.dividendsForeign);
    drawMoney(tr3, font, 328.5, 591.9, draft.dividendsForeignTax);
    drawMoney(tr3, font, 69.7, 433.6, draft.statePension);
    drawMoney(tr3, font, 69.7, 376.5, draft.statePensionLumpSum);
    drawMoney(tr3, font, 69.7, 331.9, draft.statePensionLumpSumTax);
    drawMoney(tr3, font, 69.7, 262.4, draft.otherPensions);
    drawMoney(tr3, font, 328.5, 446.1, draft.otherPensionsTax);
    drawMoney(tr3, font, 328.5, 389, draft.incapacityEsa);
    drawMoney(tr3, font, 328.5, 344.4, draft.incapacityTax);
    drawMoney(tr3, font, 328.5, 299.9, draft.jobseekersAllowance);
    drawMoney(tr3, font, 328.5, 255.3, draft.otherStateBenefits);
    drawMoney(tr3, font, 69.7, 137.7, draft.otherTaxableIncome);
    drawMoney(tr3, font, 69.7, 93.2, draft.otherIncomeExpenses);
    drawMoney(tr3, font, 69.7, 48.6, draft.otherIncomeTax);
    drawMoney(tr3, font, 328.5, 150.2, draft.preOwnedAssets);
  }

  // TR4 — reliefs
  const tr4 = pages[3];
  if (tr4) {
    drawMoney(tr4, font, 69.7, 627.9, draft.pensionReliefAtSource);
    drawMoney(tr4, font, 69.7, 583.3, draft.pensionOneOff);
    drawMoney(tr4, font, 69.7, 520.8, draft.retirementAnnuity);
    drawMoney(tr4, font, 328.5, 640.4, draft.employerPensionNotDeducted);
    drawMoney(tr4, font, 328.5, 565.4, draft.overseasPension);
    drawMoney(tr4, font, 69.7, 440.2, draft.giftAid);
    drawMoney(tr4, font, 69.7, 390.2, draft.giftAidOneOff);
    drawMoney(tr4, font, 69.7, 327.7, draft.giftAidCarryBack);
    drawMoney(tr4, font, 328.5, 427.7, draft.giftAidTreatAsThisYear);
    drawMoney(tr4, font, 328.5, 377.7, draft.sharesToCharity);
    drawMoney(tr4, font, 328.5, 327.7, draft.landToCharity);
  }

  // TR5 — student loan / HICBC
  const tr5 = pages[4];
  if (tr5) {
    if (draft.studentLoanNotification || draft.studentLoanPlan !== "none") {
      drawX(tr5, bold, 72, 720);
    }
    drawMoney(tr5, font, 328.5, 706.7, draft.studentLoanDeducted);
    drawMoney(tr5, font, 328.5, 650.8, draft.postgraduateLoanDeducted);
    drawMoney(tr5, font, 69.7, 493.9, draft.childBenefitAmount);
  }

  // TR8 — declaration date goes in the DD MM YYYY boxes under Signature (not box 26 address).
  const tr8 = pages[7];
  if (tr8) {
    if (draft.provisionalFigures) drawX(tr8, bold, 72, 718);
    if (draft.enclosingSupplementary) drawX(tr8, bold, 72, 640);
    if (draft.declarationDate) {
      drawDateBoxes(tr8, font, 90, 420, draft.declarationDate, 12);
    }
  }

  return doc.save();
}

/**
 * SA302 tax calculation — layout aligned to HMRC / accountant SA302 reports
 * (header row, income, rate working with “x rate% =”, tax deducted, payments due).
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
  const { width } = page.getSize();
  let y = 804;

  const left = 32.5;
  const mid = 385;
  const rightAmt = 555;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts?: { bold?: boolean; size?: number; center?: boolean },
  ) => {
    const f = opts?.bold ? bold : font;
    const size = opts?.size ?? 8.5;
    let drawX = x;
    if (opts?.center) {
      drawX = (width - f.widthOfTextAtSize(s, size)) / 2;
    }
    page.drawText(s, { x: drawX, y: yy, size, font: f, color: rgb(0, 0, 0) });
  };

  const amt = (n: number, xRight: number, yy: number, useBold = false) => {
    const f = useBold ? bold : font;
    const s = money(n);
    const tw = f.widthOfTextAtSize(s, 8.5);
    page.drawText(s, {
      x: xRight - tw,
      y: yy,
      size: 8.5,
      font: f,
      color: rgb(0, 0, 0),
    });
  };

  const ref = meta.submissionRef?.trim();
  if (ref) {
    text(`HMRC IRmark: ${ref}`, left + 158, y, { size: 8.5 });
  }
  y = 782.7;
  text("Tax Calculation (SA302)", 0, y, { bold: true, size: 8.5, center: true });

  y = 747;
  text("Client Name:", left + 10, y);
  text(clientName || "—", left + 68, y, { bold: true });
  text("UTR No.:", 324, y);
  text(utr || "—", 366, y, { bold: true });
  text("Tax Year:", 458, y);
  text(meta.taxYear || calc.taxYear, 501, y, { bold: true });

  y = 718.6;
  text("Income received (before tax taken off)", left, y, { bold: true });
  y -= 21;
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
  if (!incomeLines.length) {
    incomeLines.push({ label: "Total income received", amount: 0 });
  }
  for (const line of incomeLines) {
    text(line.label, left, y);
    amt(line.amount, mid + 43, y);
    y -= 20;
  }
  text("Total income received", left, y, { bold: true });
  amt(calc.totalIncome, mid + 43, y, true);
  y -= 20;
  text("minus", left, y);
  text("Personal Allowance", left + 40, y);
  amt(calc.personalAllowance, mid + 43, y);
  y -= 20;
  text("Total income on which tax is due", left, y, { bold: true });
  amt(calc.taxableIncome, mid + 43, y, true);

  y -= 20;
  text("How I have worked out your Income Tax", left, y, { bold: true });
  y -= 20;
  text(
    "Pay, pensions, profit etc.(UK rate for England and Northern Ireland)",
    115,
    y,
  );
  y -= 20;

  const rateRow = (
    label: string,
    band: number,
    ratePct: string,
    tax: number,
  ) => {
    text(label, 266, y);
    amt(band, mid + 55, y);
    text(`x ${ratePct} =`, 458, y);
    amt(tax, rightAmt, y);
    y -= 20;
  };

  for (const line of calc.breakdown) {
    // Prefer sample-style “Basic rate / x % =” when label includes a rate.
    const m = line.label.match(/^(.*?)\s+(\d+(?:\.\d+)?)%\s+on\s+£([\d,]+)/i);
    if (m) {
      rateRow(m[1]!.trim(), Number(m[3]!.replace(/,/g, "")), `${m[2]}%`, line.amount);
    } else {
      text(line.label, left, y);
      amt(line.amount, rightAmt, y);
      y -= 20;
    }
  }

  text("Total income on which tax has been charged", left, y);
  amt(calc.taxableIncome, mid + 43, y);
  y -= 20;
  text("Income Tax charged after allowances and reliefs", left, y);
  amt(calc.incomeTax, rightAmt, y);
  if (calc.class4Nic) {
    y -= 20;
    text("Class 4 National Insurance", left, y);
    amt(calc.class4Nic, rightAmt, y);
  }
  y -= 20;
  text("minus", left, y);
  text("Tax deducted", left + 40, y);
  y -= 20;
  text("From all employments, UK pensions and state benefits", left + 40, y);
  amt(calc.taxDeducted, 486, y);
  y -= 20;
  text("Total tax deducted", left + 40, y);
  amt(calc.taxDeducted, rightAmt, y);
  y -= 20;
  text("Total Income Tax due", left, y, { bold: true });
  amt(calc.totalLiability, rightAmt, y, true);

  y -= 40;
  text("Payment on account due", left, y, { bold: true });
  y -= 20;
  text("Total Income Tax Due", left, y);
  amt(calc.totalLiability, rightAmt, y, true);
  y -= 20;
  text("Decrease in tax due because of adjustment to earlier year", left, y);
  amt(0, 495, y);
  y -= 20;
  text(`${meta.taxYear || calc.taxYear} repayment being claimed now`, left, y);
  amt(0, 495, y);
  y -= 20;
  text("Payment on account already made in the year", left, y);
  amt(0, 495, y);
  y -= 20;
  text("Other payments made towards balancing payment", left, y);
  amt(0, 495, y);
  y -= 20;
  text("Amount to be collected via PAYE", left, y);
  amt(0, 495, y);
  y -= 20;
  text("Tax due", left, y, { bold: true });
  amt(calc.amountDue, rightAmt, y, true);

  const poa = calc.paymentsOnAccountEach;
  const janYear = (() => {
    const ty = meta.taxYear || calc.taxYear;
    // "2025-26" → due 31 Jan / 31 July 2027 (start year + 2).
    const start = Number(String(ty).split("-")[0]);
    return Number.isFinite(start) ? start + 2 : new Date().getFullYear() + 1;
  })();
  y -= 20;
  text(`Calculated Payment on Account due by 31st January ${janYear}`, left, y);
  amt(poa, rightAmt, y);
  y -= 20;
  text(`Total payment due by 31st January ${janYear}`, left, y, { bold: true });
  amt(calc.amountDue + poa, rightAmt, y, true);
  y -= 20;
  text(`Total payment due by 31st July ${janYear}`, left, y, { bold: true });
  amt(poa, rightAmt, y, true);

  text("1 of 1", 0, 40.9, { size: 9, center: true });

  return doc.save();
}
