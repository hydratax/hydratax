/**
 * Digitus-style year-end accounts pack PDF (practice download).
 * Layout aligned to docs/templates/year-end-accounts-template.pdf
 * and Hydra Consultancy YE reference packs.
 */

import type { Ct600Figures, Ct600ReviewCompany } from "@/server/hmrc/ct600/types";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE = { w: 595.28, h: 841.89 } as const;
const MARGIN = 48;
const INK = rgb(0.07, 0.07, 0.09);
const MUTED = rgb(0.35, 0.35, 0.38);

type Fonts = { regular: PDFFont; bold: PDFFont };

function formatIsoDateGb(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
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
  ];
  return `${Number(m[3])} ${months[Number(m[2])]} ${m[1]}`;
}

function moneyWhole(pence: number) {
  const neg = pence < 0;
  const abs = Math.abs(pence) / 100;
  const formatted = abs.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return neg ? `(${formatted})` : formatted;
}

function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function buildDigitusAccountsPdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  dormant?: boolean;
  taxChargePence?: number;
  principalActivity?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const f = opts.figures;
  const company = opts.company;
  const name = company.name.toUpperCase();
  const endLabel = formatIsoDateGb(f.periodEnd);
  const startLabel = formatIsoDateGb(f.periodStart);
  const yEnd = f.periodEnd.slice(0, 4);
  const approval = new Date().toLocaleDateString("en-GB");
  const director =
    company.declarantName?.trim() ||
    company.directors?.[0] ||
    "Director";
  const allDirectors =
    company.directors?.filter(Boolean).join(", ") || director;
  const office = (company.registeredOffice ?? "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const activity =
    opts.principalActivity?.trim() || "consultancy and related services";
  const dormant = Boolean(opts.dormant);

  const turnover = Number(f.turnoverPence);
  const cos = Number(f.costOfSalesPence);
  const admin = Number(f.administrativeExpensesPence);
  const other = Number(f.otherIncomePence);
  const gross = turnover - cos;
  const pbt = gross - admin + other;
  const tax =
    opts.taxChargePence !== undefined
      ? Math.max(0, Math.round(opts.taxChargePence))
      : Math.max(0, Math.round(pbt * 0.19));
  const pat = pbt - tax;
  const fixed = Number(f.tangibleAssetsPence);
  const cash = Number(f.cashAtBankPence);
  const debtors = Number(f.debtorsPence);
  const creditors = Number(f.creditorsPence);
  const share = Number(f.calledUpShareCapitalPence);
  const plRes = Number(f.profitAndLossAccountPence);
  const currentAssets = cash + debtors;
  const netCurrent = currentAssets - creditors;
  const totalLessCurrent = fixed + netCurrent;
  const netAssets = totalLessCurrent;
  const retainedBfwd = plRes - pat;

  const contentW = PAGE.w - MARGIN * 2;

  const newPage = () => doc.addPage([PAGE.w, PAGE.h]);

  const companyHead = (page: PDFPage, y: number) => {
    page.drawText(name, {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.bold,
      color: INK,
    });
    return y - 22;
  };

  const sectionTitle = (page: PDFPage, y: number, title: string) => {
    const tw = fonts.bold.widthOfTextAtSize(title, 13);
    page.drawText(title, {
      x: (PAGE.w - tw) / 2,
      y,
      size: 13,
      font: fonts.bold,
      color: INK,
    });
    return y - 20;
  };

  const periodLine = (page: PDFPage, y: number) => {
    const t = `FOR THE PERIOD ${startLabel.toUpperCase()} TO ${endLabel.toUpperCase()}`;
    const tw = fonts.regular.widthOfTextAtSize(t, 9);
    page.drawText(t, {
      x: (PAGE.w - tw) / 2,
      y,
      size: 9,
      font: fonts.regular,
      color: MUTED,
    });
    return y - 18;
  };

  const para = (page: PDFPage, y: number, text: string, size = 10) => {
    const lines = wrapLines(text, fonts.regular, size, contentW);
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: fonts.regular,
        color: INK,
      });
      y -= size + 3;
    }
    return y - 6;
  };

  const moneyRow = (
    page: PDFPage,
    y: number,
    label: string,
    amount: number | null,
    optsRow?: { note?: string; bold?: boolean; indent?: number },
  ) => {
    const font = optsRow?.bold ? fonts.bold : fonts.regular;
    const size = 10;
    page.drawText(label, {
      x: MARGIN + (optsRow?.indent ?? 0),
      y,
      size,
      font,
      color: INK,
    });
    if (optsRow?.note) {
      page.drawText(optsRow.note, {
        x: PAGE.w - MARGIN - 110,
        y,
        size,
        font: fonts.regular,
        color: MUTED,
      });
    }
    const v = amount === null ? "-" : moneyWhole(amount);
    page.drawText(v, {
      x: PAGE.w - MARGIN - fonts.bold.widthOfTextAtSize(v, size),
      y,
      size,
      font: fonts.bold,
      color: INK,
    });
    return y - 16;
  };

  // -- Cover --
  {
    const page = newPage();
    page.drawText(`COMPANY NUMBER: ${company.companyNumber || "-"}`, {
      x: MARGIN,
      y: PAGE.h - 72,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
    const nameSize = name.length > 36 ? 16 : 18;
    const nw = fonts.bold.widthOfTextAtSize(name, nameSize);
    page.drawText(name, {
      x: (PAGE.w - nw) / 2,
      y: PAGE.h / 2 + 48,
      size: nameSize,
      font: fonts.bold,
      color: INK,
    });
    const fs = "FINANCIAL STATEMENTS";
    page.drawText(fs, {
      x: (PAGE.w - fonts.bold.widthOfTextAtSize(fs, 12)) / 2,
      y: PAGE.h / 2 + 12,
      size: 12,
      font: fonts.bold,
      color: INK,
    });
    page.drawText("FOR THE PERIOD ENDED", {
      x: (PAGE.w - fonts.regular.widthOfTextAtSize("FOR THE PERIOD ENDED", 11)) / 2,
      y: PAGE.h / 2 - 8,
      size: 11,
      font: fonts.regular,
      color: INK,
    });
    page.drawText(endLabel.toUpperCase(), {
      x: (PAGE.w - fonts.bold.widthOfTextAtSize(endLabel.toUpperCase(), 12)) / 2,
      y: PAGE.h / 2 - 28,
      size: 12,
      font: fonts.bold,
      color: INK,
    });
  }

  // -- Index --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "INDEX TO THE FINANCIAL STATEMENTS");
    y = periodLine(page, y);
    y -= 20;
    const entries: Array<[string, string]> = [
      ["CONTENTS", "PAGE"],
      ["Company Information", "1"],
      ["Director's Report", "2"],
      ["Statement of Director's Responsibilities", "3"],
      ["Accountant's Report", "4"],
      ["Balance Sheet", "5"],
      ["Profit and Loss Account", "6"],
      ["Notes to the Accounts", "7-9"],
    ];
    for (const [label, pageNo] of entries) {
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 11,
        font: label === "CONTENTS" ? fonts.bold : fonts.regular,
        color: INK,
      });
      page.drawText(pageNo, {
        x: PAGE.w - MARGIN - fonts.bold.widthOfTextAtSize(pageNo, 11),
        y,
        size: 11,
        font: fonts.bold,
        color: INK,
      });
      y -= 22;
    }
  }

  // -- Company information --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "COMPANY INFORMATION");
    y = periodLine(page, y);
    y -= 8;
    const block = (label: string, value: string) => {
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 10,
        font: fonts.bold,
        color: INK,
      });
      y -= 14;
      for (const line of value.split("\n")) {
        page.drawText(line || "-", {
          x: MARGIN,
          y,
          size: 10,
          font: fonts.regular,
          color: INK,
        });
        y -= 14;
      }
      y -= 8;
    };
    block("Director:", allDirectors);
    block("Company Number:", company.companyNumber || "-");
    block(
      "Registered Office:",
      office.length ? office.join("\n") : "As filed at Companies House",
    );
    block("Accountants:", "HydraTax");
  }

  // -- Director's report --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "REPORT OF THE DIRECTOR");
    y = para(
      page,
      y,
      `The director is pleased to submit the annual report and the accounts of the company for the period ended ${endLabel}.`,
    );
    page.drawText("1. Principal Activity", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      `The principal activity of the company was to provide ${activity}.`,
    );
    page.drawText("2. Results", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      "The results for the year are as disclosed in the attached accounts. No dividends were paid for the year.",
    );
    page.drawText("3. Fixed Assets", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(page, y, "Movements in fixed assets are set out in note 1.");
    page.drawText("4. Events since the end of the year", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      "There have been no events since the balance sheet date which in the opinion of the director needs to be drawn to the shareholders attention.",
    );
    page.drawText("5. Directors and Shareholders", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      `The director throughout the year and their interest in the share capital of the company was as follows: Directors - ${allDirectors}.`,
    );
    page.drawText("Ordinary shares of £1 each", {
      x: MARGIN,
      y,
      size: 9,
      font: fonts.regular,
      color: MUTED,
    });
    y -= 16;
    y = moneyRow(page, y, director, share || null, { bold: true });
    page.drawText("6. Donations", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      "There were no charitable or political contributions during the year.",
    );
    y -= 10;
    page.drawText("By order of the board", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.regular,
      color: INK,
    });
    y -= 28;
    page.drawText(".....................................................", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.regular,
      color: INK,
    });
    y -= 16;
    page.drawText(`${approval}    ${director}`, {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
  }

  // -- Responsibilities --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "STATEMENT OF DIRECTOR'S RESPONSIBILITIES");
    y = para(
      page,
      y,
      "Company law requires the Directors to prepare financial statements for each financial year which give a true and fair view of the state of affairs of the Company and of the Company for that period.",
    );
    y = para(
      page,
      y,
      "In preparing those financial statements, the Directors are required to:-",
    );
    const bullets = [
      "Select suitable accounting policies and then apply them consistently,",
      "Make judgements and estimates that are reasonable and prudent,",
      "State whether applicable accounting standards have been followed, subject to any material departures disclosed and explained in the financial statements: and",
      "Prepare the financial statements on the going concern basis unless it is inappropriate to presume that the company will continue in business.",
    ];
    for (const b of bullets) {
      y = para(page, y, `- ${b}`, 9.5);
    }
    y = para(
      page,
      y,
      "The Directors are responsible for keeping proper accounting records which disclose with reasonable accuracy at any time the financial position of the Company and to enable them to ensure that the financial statements comply with the Companies Act 2006. They are also responsible for safeguarding the assets of the Company and hence for taking reasonable steps for the prevention and detection of fraud and other irregularities.",
    );
  }

  // -- Accountants' report --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "ACCOUNTANTS' REPORT TO THE DIRECTORS");
    y = periodLine(page, y);
    y = para(
      page,
      y,
      `You consider that the company is exempt from an audit for the period ended ${endLabel}.`,
    );
    y = para(
      page,
      y,
      "You have acknowledged, on the balance sheet, your responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts. These responsibilities include preparing accounts that give a true and fair view of the state of affairs of the company at the end of the financial period and of its profit or loss for the financial period.",
    );
    y = para(
      page,
      y,
      "In accordance with your instructions, we have prepared the accounts which comprise the Profit and Loss Account, the Balance Sheet and the related notes from accounting records of the company and on the basis of information and explanations you have given to us.",
    );
    y = para(
      page,
      y,
      "We have not carried out an audit or any other review, and consequently we do not express any opinion on these accounts.",
    );
    y -= 12;
    page.drawText("For and on behalf of HydraTax", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 18;
    page.drawText(`Date: ${approval}`, {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.regular,
      color: INK,
    });
  }

  // -- Balance sheet --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, `BALANCE SHEET AS AT ${endLabel.toUpperCase()}`);
    page.drawText("Notes", {
      x: PAGE.w - MARGIN - 130,
      y,
      size: 9,
      font: fonts.bold,
      color: MUTED,
    });
    page.drawText(yEnd, {
      x: PAGE.w - MARGIN - fonts.bold.widthOfTextAtSize(yEnd, 10),
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 18;
    y = moneyRow(page, y, "FIXED ASSETS", fixed, { note: "1", bold: true });
    y -= 4;
    page.drawText("CURRENT ASSETS", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Other debtors", debtors, {
      note: "2",
      indent: 12,
    });
    y = moneyRow(page, y, "Cash at bank", cash, { indent: 12 });
    y = moneyRow(page, y, "CREDITORS - Amounts due within 1 year", -creditors, {
      note: "3",
      bold: true,
    });
    y = moneyRow(page, y, "NET CURRENT ASSETS/(LIABILITIES)", netCurrent, {
      bold: true,
    });
    y = moneyRow(
      page,
      y,
      "TOTAL ASSETS LESS CURRENT LIABILITIES",
      totalLessCurrent,
      { bold: true },
    );
    y = moneyRow(page, y, "CREDITORS - Due after 1 year", null, { note: "4" });
    y = moneyRow(page, y, "Total net assets", netAssets, { bold: true });
    y -= 6;
    page.drawText("Represented by", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Share capital", share, { note: "5" });
    y = moneyRow(page, y, "Profit and loss reserve", plRes, { note: "6" });
    y -= 10;
    y = para(
      page,
      y,
      dormant
        ? `For the period ended ${endLabel} the company was entitled to exemption under section 480 of the Companies Act 2006 relating to dormant companies.`
        : `a.) For the period ended ${endLabel} the company was entitled to exemption from Audit under section 477 of the Companies Act 2006.`,
      8.5,
    );
    if (!dormant) {
      y = para(
        page,
        y,
        "b.) The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.",
        8.5,
      );
      y = para(
        page,
        y,
        "c.) The director acknowledges their responsibility for complying with the requirements of the Act with respect to accounting records and for the preparation of the accounts.",
        8.5,
      );
      y = para(
        page,
        y,
        "d.) These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.",
        8.5,
      );
    }
    y -= 4;
    page.drawText(
      `The accounts were approved by the director on ${approval}.`,
      {
        x: MARGIN,
        y,
        size: 9,
        font: fonts.regular,
        color: INK,
      },
    );
    y -= 22;
    page.drawText("---------------------------------------------  Director", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.regular,
      color: INK,
    });
    y -= 14;
    page.drawText(director, {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
  }

  // -- P&L --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "PROFIT AND LOSS ACCOUNT");
    y = periodLine(page, y);
    page.drawText("Notes", {
      x: PAGE.w - MARGIN - 130,
      y,
      size: 9,
      font: fonts.bold,
      color: MUTED,
    });
    page.drawText(yEnd, {
      x: PAGE.w - MARGIN - fonts.bold.widthOfTextAtSize(yEnd, 10),
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 18;
    y = moneyRow(page, y, "Turnover", turnover, { note: "7" });
    y = moneyRow(page, y, "Cost of sales", cos ? -cos : 0);
    y = moneyRow(page, y, "GROSS PROFIT", gross, { bold: true });
    y = moneyRow(page, y, "Administrative Expenses", admin ? -admin : 0, {
      note: "8",
    });
    y = moneyRow(page, y, "Net profit/(Loss) before taxation", pbt, {
      bold: true,
    });
    y = moneyRow(page, y, "Taxation", tax ? -tax : 0, { note: "9" });
    y = moneyRow(page, y, "Profit / (loss) after Taxation", pat, {
      bold: true,
    });
    y = moneyRow(page, y, "Dividends", null, { note: "10" });
    y = moneyRow(page, y, "Profit/(loss) for the year", pat, { bold: true });
    y = moneyRow(page, y, "Profit/(loss) bfwd", retainedBfwd);
    y = moneyRow(page, y, "Retained profit / (loss) carried fwd", plRes, {
      bold: true,
    });
  }

  // -- Notes (policies + tangible + debtors/creditors) --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "NOTES TO THE ACCOUNTS");
    y = periodLine(page, y);
    page.drawText("ACCOUNTING POLICIES", {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      "The following accounting policies have been used consistently in dealing with items which are considered material in relation to the company's accounts.",
      9,
    );
    y = para(
      page,
      y,
      "a) Basis of Accounting - Accounts are prepared on the historical cost basis of accounting.",
      9,
    );
    y = para(
      page,
      y,
      "b) Depreciation - Depreciation is calculated so as to write off the full cost of tangible fixed assets at the following annual rate: Fixtures, Fittings and Equipment 20% on a reducing balance basis.",
      9,
    );
    y = para(
      page,
      y,
      `d) Turnover - Turnover represents the takings as ${activity} and is stated exclusive of value added tax.`,
      9,
    );
    y = para(
      page,
      y,
      "e) Cash Flow Statement - The company has taken advantage of the exemption in Financial Reporting Standard No 1 from producing a cash flow statement on the grounds that it is a small company.",
      9,
    );
    page.drawText("1.) TANGIBLE ASSETS", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Net book value at period end", fixed, {
      bold: true,
    });
    y -= 8;
    page.drawText("2.) OTHER DEBTORS", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Trade / other debtors", debtors);
    y = moneyRow(page, y, "Total", debtors, { bold: true });
    y -= 8;
    page.drawText("3.) CREDITORS - due within one year", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Corporation Tax", tax);
    y = moneyRow(page, y, "Other creditors (aggregate)", Math.max(0, creditors - tax));
    y = moneyRow(page, y, "Total", creditors, { bold: true });
  }

  // -- Notes continued (share capital, P&L, note 8 admin, tax, dividends) --
  {
    const page = newPage();
    let y = companyHead(page, PAGE.h - 56);
    y = sectionTitle(page, y, "NOTES TO THE ACCOUNTS (CONTINUED)");
    y = periodLine(page, y);
    page.drawText("4.) CREDITORS - due after one year", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Bank loan / other", null);
    y -= 6;
    page.drawText("5.) CALLED UP SHARE CAPITAL", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "Authorised / Issued and fully paid", share);
    y -= 6;
    page.drawText("6.) PROFIT AND LOSS ACCOUNT", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 16;
    y = moneyRow(page, y, "As at start of period", retainedBfwd);
    y = moneyRow(page, y, "Profit/(loss) for the year", pat);
    y = moneyRow(page, y, "At end of period", plRes, { bold: true });
    y -= 6;
    page.drawText("7.) TURNOVER", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      `Turnover represents takings as ${activity} and is exclusive of VAT.`,
      9,
    );
    page.drawText("8.) ADMINISTRATIVE EXPENSES", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      "Profit/(Loss) on ordinary activities before taxation is stated after charging:",
      9,
    );
    y = moneyRow(page, y, "Administrative expenses (aggregate)", admin);
    y = moneyRow(page, y, "TOTAL EXPENDITURE", admin, { bold: true });
    y -= 8;
    page.drawText(
      "For a Note 8 line-by-line breakdown (fuel, directors' rem, etc.), open Accounts pack from Bank / Year-end.",
      {
        x: MARGIN,
        y,
        size: 8,
        font: fonts.regular,
        color: MUTED,
        maxWidth: contentW,
      },
    );
    y -= 28;
    page.drawText("9.) TAXATION", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    y = para(
      page,
      y,
      `The Corporation Tax Liability for the Year is ${moneyWhole(tax)}.`,
      9,
    );
    page.drawText("10.) DIVIDENDS", {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
    y -= 14;
    para(page, y, "Dividends Paid for the Year: -.", 9);
  }

  return doc.save();
}
