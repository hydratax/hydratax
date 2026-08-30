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

function yearLabel(iso: string) {
  return formatIsoDateGb(iso);
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
 * Digitus / Sofex-style year-end accounts pack PDF from CT figures + company credentials.
 */
export async function buildAccountsReviewPdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  dormant?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const f = opts.figures;
  const company = opts.company;
  const name = company.name.toUpperCase();
  const endLabel = yearLabel(f.periodEnd);
  const startLabel = yearLabel(f.periodStart);
  const yEnd = f.periodEnd.slice(0, 4);
  const director =
    company.declarantName?.trim() ||
    company.directors?.[0] ||
    "Director";
  const office = (company.registeredOffice ?? "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const turnover = Number(f.turnoverPence);
  const cos = Number(f.costOfSalesPence);
  const admin = Number(f.administrativeExpensesPence);
  const other = Number(f.otherIncomePence);
  const gross = turnover - cos + other;
  const pbt = gross - admin;
  const tax = Math.max(0, Math.round(pbt * 0.19));
  const pat = pbt - tax;
  const fixed = Number(f.tangibleAssetsPence);
  const cash = Number(f.cashAtBankPence);
  const debtors = Number(f.debtorsPence);
  const creditors = Number(f.creditorsPence);
  const share = Number(f.calledUpShareCapitalPence);
  const plRes = Number(f.profitAndLossAccountPence);
  const currentAssets = cash + debtors;
  const netCurrent = currentAssets - creditors;
  const netAssets = fixed + netCurrent;
  const dormant = Boolean(opts.dormant);

  const moneyWhole = (pence: number) => {
    const neg = pence < 0;
    const abs = Math.abs(pence) / 100;
    const formatted = abs.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return neg ? `(${formatted})` : formatted;
  };

  const line = (
    page: PDFPage,
    y: number,
    label: string,
    amount: number,
    bold = false,
  ) => {
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
    return y - 16;
  };

  // Cover
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(company.companyNumber || "—", {
      x: 48,
      y: PAGE.h - 80,
      size: 11,
      font: fonts.regular,
      color: MUTED,
    });
    page.drawText(name, {
      x: 48,
      y: PAGE.h / 2 + 40,
      size: 18,
      font: fonts.bold,
      color: INK,
    });
    page.drawText(
      dormant
        ? `Unaudited Dormant Accounts`
        : `Unaudited Financial Statements`,
      {
        x: 48,
        y: PAGE.h / 2 + 16,
        size: 12,
        font: fonts.regular,
        color: MUTED,
      },
    );
    page.drawText(`For the period ended ${endLabel}`, {
      x: 48,
      y: PAGE.h / 2 - 4,
      size: 12,
      font: fonts.regular,
      color: INK,
    });
  }

  // Company information
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(name, { x: 48, y: PAGE.h - 56, size: 12, font: fonts.bold });
    page.drawText("Company Information", {
      x: 48,
      y: PAGE.h - 80,
      size: 14,
      font: fonts.bold,
    });
    let y = PAGE.h - 110;
    const info = (label: string, value: string) => {
      page.drawText(label, { x: 48, y, size: 9, font: fonts.bold, color: MUTED });
      y -= 14;
      page.drawText(value, { x: 48, y, size: 10, font: fonts.regular, color: INK });
      y -= 22;
    };
    info("Directors", director);
    info(
      "Registered office",
      office.length ? office.join(", ") : "As filed at Companies House",
    );
    info("Company number", company.companyNumber || "—");
    info("Accountants", "HydraTax");
    info("Accounting period", `${startLabel} to ${endLabel}`);
  }

  // Dormant statement or directors report stub
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(name, { x: 48, y: PAGE.h - 56, size: 11, font: fonts.bold });
    if (dormant) {
      page.drawText("Dormant Company Statement", {
        x: 48,
        y: PAGE.h - 84,
        size: 14,
        font: fonts.bold,
      });
      let y = PAGE.h - 120;
      const paras = [
        `For the period ended ${endLabel}, the company was entitled to exemption under section 480 of the Companies Act 2006 relating to dormant companies.`,
        "The directors confirm that:",
        "• The company was dormant throughout the accounting period",
        "• No significant accounting transactions were undertaken by the company during the period",
        "• The company is exempt from preparing a profit and loss account under the micro-entity provisions",
        "A company is dormant during a period in which no significant accounting transactions occur. Fees to the Registrar of Companies, professional fees for preparing dormant accounts, and registered office maintenance are not regarded as significant accounting transactions.",
      ];
      for (const p of paras) {
        page.drawText(p, {
          x: 48,
          y,
          size: 10,
          font: fonts.regular,
          color: INK,
          maxWidth: PAGE.w - 96,
          lineHeight: 13,
        });
        y -= p.length > 80 ? 48 : 22;
      }
    } else {
      page.drawText("Director's Report", {
        x: 48,
        y: PAGE.h - 84,
        size: 14,
        font: fonts.bold,
      });
      let y = PAGE.h - 120;
      page.drawText(
        `The director presents the accounts for the period ${startLabel} to ${endLabel}.`,
        {
          x: 48,
          y,
          size: 10,
          font: fonts.regular,
          maxWidth: PAGE.w - 96,
          lineHeight: 13,
        },
      );
      y -= 40;
      page.drawText(`Approved by the Board on ${new Date().toLocaleDateString("en-GB")}`, {
        x: 48,
        y,
        size: 10,
        font: fonts.regular,
      });
      y -= 28;
      page.drawText(director, { x: 48, y, size: 10, font: fonts.bold });
      y -= 14;
      page.drawText("Director", { x: 48, y, size: 9, font: fonts.regular, color: MUTED });
    }
  }

  // Balance sheet
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(name, { x: 48, y: PAGE.h - 56, size: 11, font: fonts.bold });
    page.drawText("Balance Sheet", {
      x: 48,
      y: PAGE.h - 84,
      size: 14,
      font: fonts.bold,
    });
    page.drawText(`As at ${endLabel}`, {
      x: 48,
      y: PAGE.h - 102,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
    page.drawText(yEnd, {
      x: PAGE.w - 80,
      y: PAGE.h - 102,
      size: 10,
      font: fonts.bold,
    });
    let y = PAGE.h - 130;
    y = line(page, y, "Fixed assets", fixed);
    y -= 6;
    y = line(page, y, "Current assets", currentAssets);
    y = line(page, y, "Creditors: amounts falling due within one year", -creditors);
    y = line(page, y, "Net current assets (liabilities)", netCurrent, true);
    y -= 6;
    y = line(page, y, "Total assets less current liabilities", netAssets, true);
    y = line(page, y, "Total net assets (liabilities)", netAssets, true);
    y -= 12;
    y = line(page, y, "Capital and reserves", share + plRes, true);
    y -= 6;
    y = line(page, y, "Called up share capital", share);
    y = line(page, y, "Profit and loss account", plRes);
    y -= 28;
    if (dormant) {
      page.drawText(
        `For the year ending ${endLabel} the company was entitled to exemption under section 480 of the Companies Act 2006 relating to dormant companies.`,
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
      y -= 40;
    }
    page.drawText(
      "The accounts were approved by the Board of Directors and authorised for issue.",
      { x: 48, y, size: 9, font: fonts.regular },
    );
    y -= 24;
    page.drawText(director, { x: 48, y, size: 10, font: fonts.bold });
    y -= 14;
    page.drawText("Director", { x: 48, y, size: 9, font: fonts.regular, color: MUTED });
  }

  // P&L (skip detailed if dormant zeros — still show for transparency)
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(name, { x: 48, y: PAGE.h - 56, size: 11, font: fonts.bold });
    page.drawText(
      dormant ? "Profit and Loss Account (dormant — nil)" : "Profit and Loss Account",
      { x: 48, y: PAGE.h - 84, size: 14, font: fonts.bold },
    );
    page.drawText(`Period ended ${endLabel}`, {
      x: 48,
      y: PAGE.h - 102,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
    let y = PAGE.h - 130;
    y = line(page, y, "Turnover", turnover);
    y = line(page, y, "Cost of sales", -cos);
    y = line(page, y, "Gross profit", gross, true);
    y = line(page, y, "Administrative expenses", -admin);
    y = line(page, y, "Other income", other);
    y = line(page, y, "Profit / (loss) before tax", pbt, true);
    y = line(page, y, "Tax on profit", -tax);
    y = line(page, y, "Profit / (loss) for the period", pat, true);
  }

  // Notes
  {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    page.drawText(name, { x: 48, y: PAGE.h - 56, size: 11, font: fonts.bold });
    page.drawText("Notes to the Financial Statements", {
      x: 48,
      y: PAGE.h - 84,
      size: 14,
      font: fonts.bold,
    });
    let y = PAGE.h - 120;
    page.drawText("1. Accounting policies", {
      x: 48,
      y,
      size: 11,
      font: fonts.bold,
    });
    y -= 16;
    page.drawText(
      "These financial statements have been prepared in accordance with the micro-entity provisions of the Companies Act 2006 and FRS 105 The Financial Reporting Standard applicable to the Micro-entities Regime.",
      {
        x: 48,
        y,
        size: 9,
        font: fonts.regular,
        maxWidth: PAGE.w - 96,
        lineHeight: 12,
      },
    );
    y -= 48;
    page.drawText("2. Employees", { x: 48, y, size: 11, font: fonts.bold });
    y -= 16;
    page.drawText(
      dormant
        ? "The average number of employees during the period was: 0"
        : "Average number of employees: as disclosed in payroll records where applicable.",
      { x: 48, y, size: 9, font: fonts.regular },
    );
    y -= 36;
    page.drawText("3. Balance sheet extracts", {
      x: 48,
      y,
      size: 11,
      font: fonts.bold,
    });
    y -= 18;
    y = line(page, y, "Cash at bank and in hand", cash);
    y = line(page, y, "Debtors", debtors);
    y = line(page, y, "Creditors within one year", creditors);
    y = line(page, y, "Share capital", share);
    page.drawText(
      "Prepared for CT600 review · HydraTax. Not a Companies House submission copy unless separately filed.",
      {
        x: 48,
        y: 48,
        size: 7,
        font: fonts.regular,
        color: MUTED,
        maxWidth: PAGE.w - 96,
      },
    );
  }

  return doc.save();
}
