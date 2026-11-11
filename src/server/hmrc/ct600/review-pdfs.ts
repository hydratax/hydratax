import type { Ct600Figures, Ct600ReviewCompany } from "@/server/hmrc/ct600/types";
import { fillOfficialCt600Pdf } from "@/server/hmrc/ct600/official-fill";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE = { w: 595.28, h: 841.89 } as const;
const INK = rgb(0.05, 0.05, 0.08);
const MUTED = rgb(0.35, 0.35, 0.38);

function formatIsoDateGb(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${monthName(Number(m[2]))} ${m[1]}`;
}

function monthName(n: number) {
  return [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][n] ?? "";
}

type Fonts = { regular: PDFFont; bold: PDFFont };

export type { Ct600ReviewCompany } from "@/server/hmrc/ct600/types";

/**
 * Filled HMRC CT600 PDF (template + box coordinates).
 */
export async function buildCt600FormReviewPdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): Promise<Uint8Array> {
  return fillOfficialCt600Pdf(opts);
}

/**
 * Digitus-style year-end accounts pack PDF from CT figures + company credentials.
 * Matches docs/templates/year-end-accounts-template.pdf structure.
 */
export async function buildAccountsReviewPdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  dormant?: boolean;
  taxChargePence?: number;
  principalActivity?: string;
}): Promise<Uint8Array> {
  const { buildDigitusAccountsPdf } = await import(
    "@/server/accounts/build-digitus-accounts-pdf"
  );
  return buildDigitusAccountsPdf(opts);
}

/**
 * Downloadable corporation tax computation for practice review before HMRC submit.
 */
export async function buildComputationReviewPdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const page = doc.addPage([PAGE.w, PAGE.h]);
  const f = opts.figures;
  const company = opts.company;
  const name = company.name.toUpperCase();

  const moneyWhole = (pence: number) => {
    const neg = pence < 0;
    const abs = Math.abs(pence) / 100;
    const formatted = abs.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return neg ? `(${formatted})` : formatted;
  };

  const turnover = Number(f.turnoverPence);
  const cos = Number(f.costOfSalesPence);
  const admin = Number(f.administrativeExpensesPence);
  const other = Number(f.otherIncomePence);
  const tradingProfit = turnover - cos - admin + other;
  const taxable = opts.taxableProfitPence;
  const tax = opts.taxChargePence;

  page.drawText(name, {
    x: 48,
    y: PAGE.h - 56,
    size: 12,
    font: fonts.bold,
    color: INK,
  });
  page.drawText("Corporation tax computation", {
    x: 48,
    y: PAGE.h - 84,
    size: 16,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(
    `Period ${formatIsoDateGb(f.periodStart)} to ${formatIsoDateGb(f.periodEnd)}`,
    {
      x: 48,
      y: PAGE.h - 106,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    },
  );
  if (company.utr) {
    page.drawText(`UTR ${company.utr}`, {
      x: 48,
      y: PAGE.h - 122,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
  }

  let y = PAGE.h - 160;
  const row = (label: string, amount: number, bold = false) => {
    page.drawText(label, {
      x: 48,
      y,
      size: 10,
      font: bold ? fonts.bold : fonts.regular,
      color: INK,
    });
    const v = moneyWhole(amount);
    page.drawText(v, {
      x: PAGE.w - 48 - fonts.bold.widthOfTextAtSize(v, 10),
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 18;
  };

  page.drawText("£", {
    x: PAGE.w - 60,
    y: y + 4,
    size: 10,
    font: fonts.bold,
    color: MUTED,
  });
  y -= 8;
  row("Turnover", turnover);
  row("Cost of sales", -cos);
  row("Administrative expenses", -admin);
  row("Other income", other);
  y -= 6;
  row("Profit / (loss) before tax adjustments", tradingProfit, true);
  y -= 10;
  row("Taxable profits for the period", taxable, true);
  row("Corporation tax chargeable", tax, true);

  y -= 28;
  page.drawText(
    "This computation is prepared from the CT600 draft figures for practice review before submission to HMRC.",
    {
      x: 48,
      y,
      size: 8,
      font: fonts.regular,
      color: MUTED,
      maxWidth: PAGE.w - 96,
      lineHeight: 11,
    },
  );

  return doc.save();
}
